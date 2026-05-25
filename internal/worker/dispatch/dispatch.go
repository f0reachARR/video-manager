// Package dispatch coordinates between in-process River workers and the
// external hls-worker process. River workers register a job here and block on
// the Result channel; the HTTP claim endpoint hands the next pending job to a
// polling worker and feeds /progress, /complete, /fail back into the same
// in-memory slot.
//
// Dispatcher state is intentionally in-memory only: on app restart, any
// in-flight jobs are dropped and River re-runs them from its own retry queue.
// That keeps the protocol stateless on disk and matches the behavior we'd get
// from an op restarting the worker process anyway.
package dispatch

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/f0reachARR/soiree/internal/hlswire"
)

// Errors returned to the HTTP handler when a per-job request can't be matched.
var (
	ErrJobNotFound  = errors.New("dispatch: job not found")
	ErrLeaseInvalid = errors.New("dispatch: lease token invalid")
	ErrLeaseExpired = errors.New("dispatch: lease expired")
)

// LeaseTTL is how long a claimed job stays leased without a heartbeat.
const LeaseTTL = 90 * time.Second

// HeartbeatGrace is the additional grace period the dispatcher waits past a
// missed heartbeat before forcibly failing the job. This absorbs clock skew
// and short HTTP retries by the worker.
const HeartbeatGrace = 30 * time.Second

// MaxClaimWait caps how long the claim endpoint can long-poll. Worker may
// request shorter via WaitMs; longer is clamped down.
const MaxClaimWait = 30 * time.Second

// Job is the unit dispatched to an external worker. Created by the River
// worker via Submit.
type Job struct {
	ID       string
	Type     string          // hlswire.Type*
	Queue    string          // hlswire.Queue*
	Payload  json.RawMessage // ClaimResponse.Payload

	// OnProgress is invoked synchronously when a worker posts progress. If it
	// returns an error the progress write fails (the worker can retry), but
	// the job is NOT marked failed.
	OnProgress func(ctx context.Context, body json.RawMessage) error
}

// Result is delivered to the River worker once a job ends.
type Result struct {
	Payload json.RawMessage // hlswire.{Probe,Encode}Complete on success
	Err     error           // non-nil on lease expiry or worker /fail
}

// Dispatcher is safe for concurrent use.
type Dispatcher struct {
	mu       sync.Mutex
	pending  map[string][]*pendingJob // queue → FIFO of awaiting-claim jobs
	inflight map[string]*inflightJob  // jobID → claimed job
	waiters  map[string][]chan struct{}
}

// pendingJob bundles the dispatchable Job with the per-call result channel.
type pendingJob struct {
	job     *Job
	result  chan Result
	ctx     context.Context // caller's ctx; cancellation removes from queue
	removed bool
}

// inflightJob is a pendingJob that has been claimed by some worker.
type inflightJob struct {
	job          *Job
	result       chan Result
	leaseToken   string
	leaseExpires time.Time
	closed       bool
	// resultSent guards against double-write to result (e.g. lease expiry
	// races with a successful /complete).
	resultSent bool
}

// New constructs an empty Dispatcher. Call Start to begin the lease watchdog.
func New() *Dispatcher {
	return &Dispatcher{
		pending:  make(map[string][]*pendingJob),
		inflight: make(map[string]*inflightJob),
		waiters:  make(map[string][]chan struct{}),
	}
}

// Start runs the lease watchdog until ctx is done. The watchdog wakes every
// few seconds and fails any inflight job whose lease has expired (plus grace).
func (d *Dispatcher) Start(ctx context.Context) {
	go d.watchdog(ctx)
}

// Submit publishes a job and blocks until it completes, fails, or ctx is
// cancelled. River worker.Work calls this and translates Result.Err back into
// a return value that River uses for retry.
func (d *Dispatcher) Submit(ctx context.Context, job *Job) Result {
	if job.ID == "" {
		job.ID = uuid.NewString()
	}
	resultCh := make(chan Result, 1)
	pj := &pendingJob{job: job, result: resultCh, ctx: ctx}

	d.mu.Lock()
	d.pending[job.Queue] = append(d.pending[job.Queue], pj)
	d.signalWaitersLocked(job.Queue)
	d.mu.Unlock()

	select {
	case <-ctx.Done():
		// Caller is gone (app shutdown or river timeout). Remove from queue if
		// we never got claimed; mark closed if inflight so the worker's next
		// heartbeat / progress / complete will 410.
		d.mu.Lock()
		d.removePendingLocked(job.Queue, pj)
		if inf, ok := d.inflight[job.ID]; ok {
			inf.closed = true
			delete(d.inflight, job.ID)
		}
		d.mu.Unlock()
		return Result{Err: ctx.Err()}
	case r := <-resultCh:
		return r
	}
}

// Claim long-polls for the next pending job in any of the requested queues.
// Returns (nil, nil) when no job is available before the deadline — handler
// converts to 204.
func (d *Dispatcher) Claim(ctx context.Context, req hlswire.ClaimRequest) (*hlswire.ClaimResponse, error) {
	wait := MaxClaimWait
	if req.WaitMs > 0 {
		w := time.Duration(req.WaitMs) * time.Millisecond
		if w < wait {
			wait = w
		}
	}
	deadline := time.Now().Add(wait)

	for {
		d.mu.Lock()
		for _, queue := range req.Queues {
			pj := d.takePendingLocked(queue)
			if pj == nil {
				continue
			}
			inf := d.claimLocked(pj)
			d.mu.Unlock()
			return d.buildClaimResponse(inf), nil
		}

		// Nothing available — register a waiter on every queue we care about.
		notify := make(chan struct{}, 1)
		for _, queue := range req.Queues {
			d.waiters[queue] = append(d.waiters[queue], notify)
		}
		d.mu.Unlock()

		remaining := time.Until(deadline)
		if remaining <= 0 {
			d.removeWaiter(req.Queues, notify)
			return nil, nil
		}

		select {
		case <-ctx.Done():
			d.removeWaiter(req.Queues, notify)
			return nil, ctx.Err()
		case <-time.After(remaining):
			d.removeWaiter(req.Queues, notify)
			return nil, nil
		case <-notify:
			// loop and try again — another claim may have grabbed the job
			d.removeWaiter(req.Queues, notify)
		}
	}
}

// Heartbeat extends the lease for a claimed job.
func (d *Dispatcher) Heartbeat(jobID, leaseToken string) (time.Time, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	inf, err := d.lookupLocked(jobID, leaseToken)
	if err != nil {
		return time.Time{}, err
	}
	inf.leaseExpires = time.Now().Add(LeaseTTL)
	return inf.leaseExpires, nil
}

// Progress forwards a /progress body to the River worker's OnProgress callback.
func (d *Dispatcher) Progress(ctx context.Context, jobID, leaseToken string, body json.RawMessage) error {
	d.mu.Lock()
	inf, err := d.lookupLocked(jobID, leaseToken)
	if err != nil {
		d.mu.Unlock()
		return err
	}
	cb := inf.job.OnProgress
	d.mu.Unlock()
	if cb == nil {
		return nil
	}
	return cb(ctx, body)
}

// Complete marks the job successful. Idempotent: a second call with the same
// lease token is a no-op.
func (d *Dispatcher) Complete(jobID, leaseToken string, body json.RawMessage) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	inf, err := d.lookupLocked(jobID, leaseToken)
	if err != nil {
		return err
	}
	d.finishLocked(inf, Result{Payload: body})
	return nil
}

// Fail marks the job failed. River retries via its own backoff.
func (d *Dispatcher) Fail(jobID, leaseToken, errMsg string) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	inf, err := d.lookupLocked(jobID, leaseToken)
	if err != nil {
		return err
	}
	d.finishLocked(inf, Result{Err: errors.New(errMsg)})
	return nil
}

// --- internal helpers (caller holds d.mu unless noted) ---

func (d *Dispatcher) takePendingLocked(queue string) *pendingJob {
	for len(d.pending[queue]) > 0 {
		pj := d.pending[queue][0]
		d.pending[queue] = d.pending[queue][1:]
		if pj.removed {
			continue
		}
		if pj.ctx.Err() != nil {
			pj.removed = true
			continue
		}
		return pj
	}
	return nil
}

func (d *Dispatcher) removePendingLocked(queue string, target *pendingJob) {
	target.removed = true
	q := d.pending[queue]
	for i, pj := range q {
		if pj == target {
			d.pending[queue] = append(q[:i], q[i+1:]...)
			return
		}
	}
}

func (d *Dispatcher) claimLocked(pj *pendingJob) *inflightJob {
	inf := &inflightJob{
		job:          pj.job,
		result:       pj.result,
		leaseToken:   newToken(),
		leaseExpires: time.Now().Add(LeaseTTL),
	}
	d.inflight[pj.job.ID] = inf
	return inf
}

func (d *Dispatcher) buildClaimResponse(inf *inflightJob) *hlswire.ClaimResponse {
	return &hlswire.ClaimResponse{
		JobID:          inf.job.ID,
		Type:           inf.job.Type,
		LeaseToken:     inf.leaseToken,
		LeaseExpiresAt: inf.leaseExpires,
		Payload:        inf.job.Payload,
	}
}

func (d *Dispatcher) lookupLocked(jobID, leaseToken string) (*inflightJob, error) {
	inf, ok := d.inflight[jobID]
	if !ok {
		return nil, ErrJobNotFound
	}
	if inf.closed {
		return nil, ErrJobNotFound
	}
	if inf.leaseToken != leaseToken {
		return nil, ErrLeaseInvalid
	}
	return inf, nil
}

func (d *Dispatcher) finishLocked(inf *inflightJob, r Result) {
	if inf.resultSent {
		return
	}
	inf.resultSent = true
	inf.closed = true
	select {
	case inf.result <- r:
	default:
	}
	delete(d.inflight, inf.job.ID)
}

func (d *Dispatcher) signalWaitersLocked(queue string) {
	for _, ch := range d.waiters[queue] {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}

func (d *Dispatcher) removeWaiter(queues []string, target chan struct{}) {
	d.mu.Lock()
	defer d.mu.Unlock()
	for _, q := range queues {
		ws := d.waiters[q]
		for i, ch := range ws {
			if ch == target {
				d.waiters[q] = append(ws[:i], ws[i+1:]...)
				break
			}
		}
	}
}

func (d *Dispatcher) watchdog(ctx context.Context) {
	tick := time.NewTicker(10 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-tick.C:
			d.expireLeases(now)
		}
	}
}

func (d *Dispatcher) expireLeases(now time.Time) {
	d.mu.Lock()
	defer d.mu.Unlock()
	for id, inf := range d.inflight {
		if inf.resultSent {
			delete(d.inflight, id)
			continue
		}
		if now.After(inf.leaseExpires.Add(HeartbeatGrace)) {
			d.finishLocked(inf, Result{Err: ErrLeaseExpired})
		}
	}
}

func newToken() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}
