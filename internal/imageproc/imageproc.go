// Package imageproc decodes uploaded photos, extracts EXIF metadata,
// generates a display copy when needed (for browser-incompatible formats
// like HEIC or images with non-trivial EXIF orientation), and renders a
// fixed-size JPEG thumbnail. It is shelled out to heif-convert for HEIC
// to avoid pulling in a C/C++ HEVC decoder.
package imageproc

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	exif "github.com/dsoprea/go-exif/v3"
	exifcommon "github.com/dsoprea/go-exif/v3/common"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp" // register WebP decoder

)

// ThumbnailLongEdge is the long-edge pixel size of the generated thumbnail.
const ThumbnailLongEdge = 320

// Result is what the handler stores: bytes + metadata for original /
// display copy / thumbnail.
type Result struct {
	// OrigBytes is the raw input. Always set.
	OrigBytes        []byte
	OrigContentType  string // sniffed; one of jpeg/png/webp/heic/heif

	// DisplayBytes is set only when OrigBytes can't be safely served as-is
	// (HEIC / HEIF) or when EXIF orientation needs to be baked in.
	DisplayBytes        []byte
	DisplayContentType  string

	// ThumbBytes is a JPEG with the long edge clamped to ThumbnailLongEdge.
	ThumbBytes []byte

	Width  int
	Height int

	// CapturedAt is parsed from EXIF DateTimeOriginal (+ OffsetTimeOriginal
	// if present). Zero when unavailable.
	CapturedAt time.Time

	// Orientation is the raw EXIF tag value (1..8). Zero when unset.
	Orientation int
}

// AcceptedMimes lists every content-type the API will accept. Anything else
// is rejected with 415 by the caller.
var AcceptedMimes = []string{
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/heic",
	"image/heif",
}

// Sniff inspects the first 512 bytes to decide the content-type. We do NOT
// trust the client-supplied filename extension or Content-Type header.
func Sniff(raw []byte) string {
	if len(raw) >= 12 {
		// HEIC/HEIF: ISO BMFF box "ftyp" at offset 4, brand at 8..12.
		if string(raw[4:8]) == "ftyp" {
			brand := string(raw[8:12])
			switch brand {
			case "heic", "heix", "hevc", "heim", "heis":
				return "image/heic"
			case "mif1", "msf1", "heif":
				return "image/heif"
			}
		}
	}
	t := http.DetectContentType(raw)
	// DetectContentType reports "application/octet-stream" for WebP on some
	// implementations; double-check via magic bytes.
	if len(raw) >= 12 && string(raw[0:4]) == "RIFF" && string(raw[8:12]) == "WEBP" {
		return "image/webp"
	}
	return t
}

// HeifConvertAvailable returns true if the heif-convert binary is in PATH.
// The caller can decide to reject HEIC uploads (415) when it's missing.
func HeifConvertAvailable() bool {
	_, err := exec.LookPath("heif-convert")
	return err == nil
}

// Process runs the full pipeline. The returned Result is independent of
// the input slice and safe to retain.
func Process(raw []byte) (*Result, error) {
	mime := Sniff(raw)
	if !isAccepted(mime) {
		return nil, fmt.Errorf("unsupported content-type: %s", mime)
	}

	res := &Result{
		OrigBytes:       raw,
		OrigContentType: mime,
	}

	// EXIF: try to read it from the original bytes first. For HEIC the
	// dsoprea library can scan the file for the EXIF blob; if it can't we
	// fall back to reading EXIF from the converted JPEG below.
	if captured, orient, ok := readExif(raw); ok {
		res.CapturedAt = captured
		res.Orientation = orient
	}

	// Decode into an in-memory image we can scale / orient-fix.
	img, err := decode(raw, mime)
	if err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}

	// If the decoder already rotated for us (heif-convert does), or the
	// orientation tag is 1 / unset, no rotation is needed.
	if needsOrientationBake(res.Orientation, mime) {
		img = applyOrientation(img, res.Orientation)
	}

	b := img.Bounds()
	res.Width = b.Dx()
	res.Height = b.Dy()

	// Display copy: HEIC always needs one; JPEG/PNG/WebP with non-trivial
	// orientation also need one so the browser sees the baked rotation.
	if mime == "image/heic" || mime == "image/heif" || needsOrientationBake(res.Orientation, mime) {
		buf := &bytes.Buffer{}
		if err := jpeg.Encode(buf, img, &jpeg.Options{Quality: 88}); err != nil {
			return nil, fmt.Errorf("encode display: %w", err)
		}
		res.DisplayBytes = buf.Bytes()
		res.DisplayContentType = "image/jpeg"
	}

	// Thumbnail: long-edge ThumbnailLongEdge, CatmullRom, JPEG q=82.
	thumb := scaleLongEdge(img, ThumbnailLongEdge)
	tb := &bytes.Buffer{}
	if err := jpeg.Encode(tb, thumb, &jpeg.Options{Quality: 82}); err != nil {
		return nil, fmt.Errorf("encode thumb: %w", err)
	}
	res.ThumbBytes = tb.Bytes()

	return res, nil
}

func isAccepted(mime string) bool {
	for _, m := range AcceptedMimes {
		if m == mime {
			return true
		}
	}
	return false
}

// needsOrientationBake reports whether the EXIF orientation tag implies a
// transform the decoder hasn't already applied. heif-convert applies it
// itself, so HEIC is exempt.
func needsOrientationBake(orient int, mime string) bool {
	if mime == "image/heic" || mime == "image/heif" {
		return false
	}
	return orient > 1 && orient <= 8
}

func decode(raw []byte, mime string) (image.Image, error) {
	switch mime {
	case "image/jpeg":
		return jpeg.Decode(bytes.NewReader(raw))
	case "image/png":
		return png.Decode(bytes.NewReader(raw))
	case "image/webp":
		img, _, err := image.Decode(bytes.NewReader(raw))
		return img, err
	case "image/heic", "image/heif":
		return decodeHEIC(raw)
	}
	// Should be caught earlier.
	return nil, fmt.Errorf("decode: unsupported mime %s", mime)
}

func decodeHEIC(raw []byte) (image.Image, error) {
	if !HeifConvertAvailable() {
		return nil, errors.New("heif-convert not installed; install libheif (brew install libheif / apk add libheif-tools)")
	}
	tmp, err := os.MkdirTemp("", "heic-*")
	if err != nil {
		return nil, fmt.Errorf("tmpdir: %w", err)
	}
	defer os.RemoveAll(tmp)

	inPath := filepath.Join(tmp, "in.heic")
	outPath := filepath.Join(tmp, "out.jpg")
	if err := os.WriteFile(inPath, raw, 0o600); err != nil {
		return nil, fmt.Errorf("write tmp: %w", err)
	}
	// -q 92 keeps the intermediate JPEG close to lossless so the downstream
	// re-encode (q=88) doesn't compound artifacts visibly.
	cmd := exec.Command("heif-convert", "-q", "92", inPath, outPath)
	cmd.Stderr = io.Discard
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("heif-convert: %w", err)
	}
	f, err := os.Open(outPath)
	if err != nil {
		return nil, fmt.Errorf("open converted: %w", err)
	}
	defer f.Close()
	return jpeg.Decode(f)
}

// scaleLongEdge returns img resized so its longer edge equals target.
// Pass-through if the image is already smaller.
func scaleLongEdge(img image.Image, target int) image.Image {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= target && h <= target {
		return img
	}
	var dw, dh int
	if w >= h {
		dw = target
		dh = h * target / w
	} else {
		dh = target
		dw = w * target / h
	}
	dst := image.NewRGBA(image.Rect(0, 0, dw, dh))
	draw.CatmullRom.Scale(dst, dst.Bounds(), img, b, draw.Over, nil)
	return dst
}

// applyOrientation rotates / flips img so the EXIF orientation tag becomes
// a no-op. Values follow the EXIF spec:
//
//   1 = no transform        5 = transpose
//   2 = flip horizontal     6 = rotate 90 CW
//   3 = rotate 180          7 = transverse
//   4 = flip vertical       8 = rotate 270 CW
func applyOrientation(img image.Image, orient int) image.Image {
	switch orient {
	case 2:
		return flipH(img)
	case 3:
		return rotate180(img)
	case 4:
		return flipV(img)
	case 5:
		return rotate90(flipH(img))
	case 6:
		return rotate90(img)
	case 7:
		return rotate90(flipV(img))
	case 8:
		return rotate270(img)
	}
	return img
}

func flipH(src image.Image) image.Image {
	b := src.Bounds()
	dst := image.NewRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	for y := 0; y < b.Dy(); y++ {
		for x := 0; x < b.Dx(); x++ {
			dst.Set(b.Dx()-1-x, y, src.At(b.Min.X+x, b.Min.Y+y))
		}
	}
	return dst
}

func flipV(src image.Image) image.Image {
	b := src.Bounds()
	dst := image.NewRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	for y := 0; y < b.Dy(); y++ {
		for x := 0; x < b.Dx(); x++ {
			dst.Set(x, b.Dy()-1-y, src.At(b.Min.X+x, b.Min.Y+y))
		}
	}
	return dst
}

func rotate90(src image.Image) image.Image {
	b := src.Bounds()
	dst := image.NewRGBA(image.Rect(0, 0, b.Dy(), b.Dx()))
	for y := 0; y < b.Dy(); y++ {
		for x := 0; x < b.Dx(); x++ {
			dst.Set(b.Dy()-1-y, x, src.At(b.Min.X+x, b.Min.Y+y))
		}
	}
	return dst
}

func rotate180(src image.Image) image.Image {
	b := src.Bounds()
	dst := image.NewRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	for y := 0; y < b.Dy(); y++ {
		for x := 0; x < b.Dx(); x++ {
			dst.Set(b.Dx()-1-x, b.Dy()-1-y, src.At(b.Min.X+x, b.Min.Y+y))
		}
	}
	return dst
}

func rotate270(src image.Image) image.Image {
	b := src.Bounds()
	dst := image.NewRGBA(image.Rect(0, 0, b.Dy(), b.Dx()))
	for y := 0; y < b.Dy(); y++ {
		for x := 0; x < b.Dx(); x++ {
			dst.Set(y, b.Dx()-1-x, src.At(b.Min.X+x, b.Min.Y+y))
		}
	}
	return dst
}

// readExif extracts DateTimeOriginal (+ OffsetTimeOriginal if present)
// and Orientation from EXIF tags embedded in the file bytes. Returns
// (zero, 0, false) when no EXIF can be located.
func readExif(raw []byte) (time.Time, int, bool) {
	exifData, err := exif.SearchAndExtractExif(raw)
	if err != nil {
		return time.Time{}, 0, false
	}
	entries, _, err := exif.GetFlatExifData(exifData, nil)
	if err != nil {
		return time.Time{}, 0, false
	}
	var dto, offset string
	var orient int
	for _, e := range entries {
		switch e.TagName {
		case "DateTimeOriginal":
			if v, ok := e.Value.(string); ok {
				dto = v
			}
		case "OffsetTimeOriginal":
			if v, ok := e.Value.(string); ok {
				offset = v
			}
		case "Orientation":
			orient = exifIntValue(e)
		}
	}
	var captured time.Time
	if dto != "" {
		captured = parseExifDateTime(dto, offset)
	}
	return captured, orient, !captured.IsZero() || orient != 0
}

func exifIntValue(e exif.ExifTag) int {
	switch v := e.Value.(type) {
	case []uint16:
		if len(v) > 0 {
			return int(v[0])
		}
	case uint16:
		return int(v)
	case []uint32:
		if len(v) > 0 {
			return int(v[0])
		}
	case int:
		return v
	case []exifcommon.SignedRational:
		// Orientation never uses this; defensive only.
	}
	return 0
}

// parseExifDateTime parses "YYYY:MM:DD HH:MM:SS" + optional "+09:00".
// When no offset is supplied we fall back to UTC: better to be slightly
// off than to silently apply server-local time.
func parseExifDateTime(dto, offset string) time.Time {
	dto = strings.TrimSpace(dto)
	if dto == "" {
		return time.Time{}
	}
	layout := "2006:01:02 15:04:05"
	if offset != "" {
		layout += "-07:00"
		if t, err := time.Parse(layout, dto+offset); err == nil {
			return t
		}
	}
	if t, err := time.Parse(layout, dto); err == nil {
		return t.UTC()
	}
	return time.Time{}
}
