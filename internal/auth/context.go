package auth

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/f0reachARR/video-manager/internal/db/sqlc"
)

// ctxKey is unexported so external packages can't accidentally collide.
type ctxKey int

const (
	userCtxKey ctxKey = iota
)

// WithUser attaches a fully-resolved user to the request context. Handlers
// pull it back out via UserFromContext.
func WithUser(ctx context.Context, u *sqlc.User) context.Context {
	if u == nil {
		return ctx
	}
	return context.WithValue(ctx, userCtxKey, u)
}

// UserFromContext returns the authenticated user, or nil if the request was
// unauthenticated. Handlers that require auth should also call
// `Required(ctx)` or check the result themselves.
func UserFromContext(ctx context.Context) *sqlc.User {
	u, _ := ctx.Value(userCtxKey).(*sqlc.User)
	return u
}

// UserIDFromContext returns the authenticated user's UUID as a pgtype.UUID,
// or the zero value (Valid=false) if no user is attached. Convenience helper
// because most sqlc params want a pgtype.UUID.
func UserIDFromContext(ctx context.Context) pgtype.UUID {
	u := UserFromContext(ctx)
	if u == nil {
		return pgtype.UUID{}
	}
	return u.ID
}
