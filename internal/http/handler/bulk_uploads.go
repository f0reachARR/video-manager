package handler

import (
	"context"
	"encoding/hex"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/f0reachARR/soiree/internal/db/sqlc"
)

// BulkUploads owns the per-tournament dedup memory used by the on-site
// bulk-upload UI. The browser hashes the first 1 MiB of each candidate file
// (SHA-256) and posts {headHashHex,sizeBytes,filename,mediaKind} batches to
// /check; the same key is later registered when the upload finishes (via
// tus hook for videos, multipart endpoint for images).
type BulkUploads struct {
	Q *sqlc.Queries
}

const headHashHexLen = 64 // sha-256 hex

type bulkUploadCheckItem struct {
	HeadHashHex string `json:"headHashHex"`
	SizeBytes   int64  `json:"sizeBytes"`
	Filename    string `json:"filename"`
	MediaKind   string `json:"mediaKind"`
}

type bulkUploadCheckRequest struct {
	Items []bulkUploadCheckItem `json:"items"`
}

type bulkUploadCheckResult struct {
	HeadHashHex  string     `json:"headHashHex"`
	SizeBytes    int64      `json:"sizeBytes"`
	Known        bool       `json:"known"`
	MediaKind    *string    `json:"mediaKind,omitempty"`
	VideoID      *string    `json:"videoId"`
	RobotImageID *string    `json:"robotImageId"`
	Filename     *string    `json:"filename"`
	CreatedAt    *time.Time `json:"createdAt"`
}

type bulkUploadCheckResponse struct {
	Results []bulkUploadCheckResult `json:"results"`
}

// fingerprintKey identifies a fingerprint within one tournament. Using a
// fixed-size hex string keeps the key cheap to compare in the response map.
type fingerprintKey struct {
	Hex  string
	Size int64
}

func (h *BulkUploads) tournamentExists(ctx context.Context, id pgtype.UUID) (bool, error) {
	if _, err := h.Q.GetTournament(ctx, id); err != nil {
		if isNoRows(err) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (h *BulkUploads) Check(w http.ResponseWriter, r *http.Request) {
	tid, err := parseUUIDParam(chi.URLParam(r, "tournamentId"))
	if err != nil {
		badRequest(w, "invalid tournamentId")
		return
	}
	var req bulkUploadCheckRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	ok, err := h.tournamentExists(r.Context(), tid)
	if err != nil {
		internalError(w, err)
		return
	}
	if !ok {
		notFound(w, "tournament not found")
		return
	}

	// Decode hashes once. Build two parallel slices for the UNNEST query,
	// and remember the original input order so we can return results aligned.
	hashes := make([][]byte, 0, len(req.Items))
	sizes := make([]int64, 0, len(req.Items))
	for i, it := range req.Items {
		if len(it.HeadHashHex) != headHashHexLen {
			writeError(w, http.StatusUnprocessableEntity, "validation",
				"items["+strconv.Itoa(i)+"].headHashHex must be 64 hex chars", nil)
			return
		}
		b, err := hex.DecodeString(it.HeadHashHex)
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, "validation",
				"items["+strconv.Itoa(i)+"].headHashHex is not hex", nil)
			return
		}
		if it.SizeBytes < 0 {
			writeError(w, http.StatusUnprocessableEntity, "validation",
				"items["+strconv.Itoa(i)+"].sizeBytes must be >= 0", nil)
			return
		}
		hashes = append(hashes, b)
		sizes = append(sizes, it.SizeBytes)
	}

	results := make([]bulkUploadCheckResult, len(req.Items))
	for i, it := range req.Items {
		results[i] = bulkUploadCheckResult{
			HeadHashHex: it.HeadHashHex,
			SizeBytes:   it.SizeBytes,
			Known:       false,
		}
	}

	if len(hashes) > 0 {
		rows, err := h.Q.ListBulkUploadFingerprintsByHashes(r.Context(),
			sqlc.ListBulkUploadFingerprintsByHashesParams{
				TournamentID:  tid,
				HeadHashes:    hashes,
				SizeBytesList: sizes,
			})
		if err != nil {
			internalError(w, err)
			return
		}
		byKey := make(map[fingerprintKey]sqlc.BulkUploadFingerprint, len(rows))
		for _, row := range rows {
			byKey[fingerprintKey{Hex: hex.EncodeToString(row.HeadHash), Size: row.SizeBytes}] = row
		}
		for i, it := range req.Items {
			row, ok := byKey[fingerprintKey{Hex: it.HeadHashHex, Size: it.SizeBytes}]
			if !ok {
				continue
			}
			results[i].Known = true
			kind := row.MediaKind
			results[i].MediaKind = &kind
			if row.VideoID.Valid {
				s := uuidString(row.VideoID)
				results[i].VideoID = &s
			}
			if row.RobotImageID.Valid {
				s := uuidString(row.RobotImageID)
				results[i].RobotImageID = &s
			}
			fn := row.Filename
			results[i].Filename = &fn
			ts := row.CreatedAt.Time
			results[i].CreatedAt = &ts
		}
	}

	writeJSON(w, http.StatusOK, bulkUploadCheckResponse{Results: results})
}

func (h *BulkUploads) ClearFingerprints(w http.ResponseWriter, r *http.Request) {
	tid, err := parseUUIDParam(chi.URLParam(r, "tournamentId"))
	if err != nil {
		badRequest(w, "invalid tournamentId")
		return
	}
	ok, err := h.tournamentExists(r.Context(), tid)
	if err != nil {
		internalError(w, err)
		return
	}
	if !ok {
		notFound(w, "tournament not found")
		return
	}
	if _, err := h.Q.ClearBulkUploadFingerprintsForTournament(r.Context(), tid); err != nil {
		internalError(w, err)
		return
	}
	writeNoContent(w)
}

// RegisterVideoFingerprint is called by the tus hook after a video row is
// created. It is safe to call with a zero/invalid tournament ID — the call
// is a no-op then so we don't have to guard at every hook callsite.
func (h *BulkUploads) RegisterVideoFingerprint(ctx context.Context, tournamentID pgtype.UUID, videoID pgtype.UUID, headHash []byte, sizeBytes int64, filename string) error {
	if !tournamentID.Valid || len(headHash) == 0 {
		return nil
	}
	_, err := h.Q.UpsertBulkUploadFingerprint(ctx, sqlc.UpsertBulkUploadFingerprintParams{
		TournamentID: tournamentID,
		HeadHash:     headHash,
		SizeBytes:    sizeBytes,
		Filename:     filename,
		MediaKind:    "video",
		VideoID:      videoID,
	})
	return err
}

// RegisterImageFingerprint is called by /api/robots/{id}/images after the
// row is created. Same no-op behavior on missing tournament/hash as the
// video variant.
func (h *BulkUploads) RegisterImageFingerprint(ctx context.Context, tournamentID pgtype.UUID, imageID pgtype.UUID, headHash []byte, sizeBytes int64, filename string) error {
	if !tournamentID.Valid || len(headHash) == 0 {
		return nil
	}
	_, err := h.Q.UpsertBulkUploadFingerprint(ctx, sqlc.UpsertBulkUploadFingerprintParams{
		TournamentID: tournamentID,
		HeadHash:     headHash,
		SizeBytes:    sizeBytes,
		Filename:     filename,
		MediaKind:    "image",
		RobotImageID: imageID,
	})
	return err
}
