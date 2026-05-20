package imageproc

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"
)

func TestProcessSmallJPEGNoEXIF(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 50, 80))
	for x := 0; x < 50; x++ {
		for y := 0; y < 80; y++ {
			img.Set(x, y, color.RGBA{R: 255, A: 255})
		}
	}
	buf := &bytes.Buffer{}
	if err := jpeg.Encode(buf, img, nil); err != nil {
		t.Fatalf("encode: %v", err)
	}

	res, err := Process(buf.Bytes())
	if err != nil {
		t.Fatalf("process: %v", err)
	}
	if res.OrigContentType != "image/jpeg" {
		t.Errorf("sniffed mime = %s", res.OrigContentType)
	}
	if res.Width != 50 || res.Height != 80 {
		t.Errorf("dims = %dx%d, want 50x80", res.Width, res.Height)
	}
	if res.DisplayBytes != nil {
		t.Errorf("display copy unexpected for orient=0/1")
	}
	if len(res.ThumbBytes) == 0 {
		t.Errorf("thumb empty")
	}
	thumbImg, err := jpeg.Decode(bytes.NewReader(res.ThumbBytes))
	if err != nil {
		t.Fatalf("decode thumb: %v", err)
	}
	// Original is 50x80, smaller than 320 — thumb passes through unchanged.
	if thumbImg.Bounds().Dx() != 50 || thumbImg.Bounds().Dy() != 80 {
		t.Errorf("thumb dims = %v, want 50x80 (pass-through)", thumbImg.Bounds())
	}
}

func TestProcessLargeJPEGGetsThumbnailed(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 1280, 640))
	buf := &bytes.Buffer{}
	if err := jpeg.Encode(buf, img, nil); err != nil {
		t.Fatalf("encode: %v", err)
	}
	res, err := Process(buf.Bytes())
	if err != nil {
		t.Fatalf("process: %v", err)
	}
	th, err := jpeg.Decode(bytes.NewReader(res.ThumbBytes))
	if err != nil {
		t.Fatalf("decode thumb: %v", err)
	}
	if th.Bounds().Dx() != 320 {
		t.Errorf("thumb long edge = %d, want 320", th.Bounds().Dx())
	}
	if th.Bounds().Dy() != 160 {
		t.Errorf("thumb short edge = %d, want 160", th.Bounds().Dy())
	}
}

func TestProcessPNG(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 10, 10))
	buf := &bytes.Buffer{}
	if err := png.Encode(buf, img); err != nil {
		t.Fatalf("encode: %v", err)
	}
	res, err := Process(buf.Bytes())
	if err != nil {
		t.Fatalf("process: %v", err)
	}
	if res.OrigContentType != "image/png" {
		t.Errorf("mime = %s", res.OrigContentType)
	}
	if res.DisplayBytes != nil {
		t.Errorf("display copy unexpected for PNG without orientation")
	}
}

func TestProcessRejectsUnknown(t *testing.T) {
	_, err := Process([]byte("not an image"))
	if err == nil {
		t.Errorf("expected error for garbage input")
	}
}
