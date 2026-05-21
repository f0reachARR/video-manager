// Package hlswire defines the JSON payloads exchanged between the API and the
// external hls-worker over the /internal/worker/jobs/* endpoints. Both sides
// import this package so the wire format stays in lockstep.
package hlswire

import (
	"encoding/json"
	"time"
)

// Job types. Mirrors the River job kinds but lives on the API/worker boundary.
const (
	TypeProbe         = "video.probe"
	TypeEncodeVariant = "video.hls.encode_variant"
)

// Queues advertised to workers. Workers pick which queues they're willing to
// service at startup; the dispatcher only hands them matching jobs.
const (
	QueueProbe  = "probe"
	QueueEncode = "encode"
)

// ClaimRequest is the body of POST /internal/worker/jobs/claim.
type ClaimRequest struct {
	WorkerID string   `json:"workerId"`
	Queues   []string `json:"queues"`
	// WaitMs is the worker's preferred long-poll duration. The server clamps
	// this to its own maximum.
	WaitMs int `json:"waitMs,omitempty"`
}

// ClaimResponse is returned by POST /internal/worker/jobs/claim when a job is
// available. A 204 No Content means "no work right now; poll again."
type ClaimResponse struct {
	JobID          string          `json:"jobId"`
	Type           string          `json:"type"`
	LeaseToken     string          `json:"leaseToken"`
	LeaseExpiresAt time.Time       `json:"leaseExpiresAt"`
	Payload        json.RawMessage `json:"payload"`
}

// HeartbeatResponse is returned by POST /internal/worker/jobs/{id}/heartbeat.
type HeartbeatResponse struct {
	LeaseExpiresAt time.Time `json:"leaseExpiresAt"`
}

// LeaseAuth is included as a JSON field on every per-job request so the
// dispatcher can verify the caller actually owns the lease.
type LeaseAuth struct {
	LeaseToken string `json:"leaseToken"`
}

// FailRequest is the body of POST /internal/worker/jobs/{id}/fail.
type FailRequest struct {
	LeaseAuth
	Error string `json:"error"`
}

// ---------- probe ----------

// ProbeClaim is the per-job ClaimResponse.Payload for TypeProbe.
type ProbeClaim struct {
	VideoID             string `json:"videoId"`
	SourceURL           string `json:"sourceUrl"`           // presigned GET, short-lived
	ThumbnailKey        string `json:"thumbnailKey"`        // worker uploads here on success
	DeviceTimeOffsetSec int32  `json:"deviceTimeOffsetSec"` // subtracted from recordedAt by the worker
}

// ProbeComplete is the body of POST /internal/worker/jobs/{id}/complete for
// probe jobs. Fields are optional: omitted = "no value extracted".
type ProbeComplete struct {
	LeaseAuth
	RecordedAt    *time.Time `json:"recordedAt,omitempty"`
	DurationSec   *int32     `json:"durationSec,omitempty"`
	VideoCodec    string     `json:"videoCodec,omitempty"`
	AudioCodec    string     `json:"audioCodec,omitempty"`
	Width         *int32     `json:"width,omitempty"`
	Height        *int32     `json:"height,omitempty"`
	PassthroughOK bool       `json:"passthroughOk"`
	// ThumbnailKey echoes back the key the worker actually wrote to (or empty
	// if thumbnail extraction failed). Echoing rather than re-deriving lets
	// the API tolerate worker-side fallbacks without inventing new fields.
	ThumbnailKey string `json:"thumbnailKey,omitempty"`
}

// ---------- encode_variant ----------

// EncodeClaim is the per-job ClaimResponse.Payload for TypeEncodeVariant.
type EncodeClaim struct {
	VideoID      string `json:"videoId"`
	RenditionID  string `json:"renditionId"`
	SourceURL    string `json:"sourceUrl"`    // presigned GET, long TTL (~6h)
	HLSPrefix    string `json:"hlsPrefix"`    // "hls/<videoId>/<kind>/"
	Passthrough  bool   `json:"passthrough"`
	Width        int32  `json:"width,omitempty"`
	Height       int32  `json:"height,omitempty"`
	VideoBitrate string `json:"videoBitrate,omitempty"`
	AudioBitrate string `json:"audioBitrate,omitempty"`
	SegmentSec   int    `json:"segmentSec"`
}

// EncodeProgress is the body of POST /internal/worker/jobs/{id}/progress for
// encode_variant jobs. The worker batches segment notifications and posts
// every N segments / T seconds, sending the absolute count rather than a
// delta (idempotent on retry).
type EncodeProgress struct {
	LeaseAuth
	SegmentsDone int32 `json:"segmentsDone"`
}

// EncodeComplete is the body of POST /internal/worker/jobs/{id}/complete for
// encode_variant jobs. The worker has already uploaded segments + playlist to
// S3 before posting this — the API only needs to flip rendition status.
type EncodeComplete struct {
	LeaseAuth
}
