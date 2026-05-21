package ffmpeg

import "testing"

func ptr32(v int32) *int32 { return &v }

func TestPassthroughOK(t *testing.T) {
	cases := []struct {
		name string
		m    Metadata
		want bool
	}{
		{"H264 High + AAC", Metadata{VideoCodec: "h264", VideoProfile: "High", AudioCodec: "aac", Width: ptr32(1920), Height: ptr32(1080)}, true},
		{"H264 Main + AAC", Metadata{VideoCodec: "h264", VideoProfile: "Main", AudioCodec: "aac", Width: ptr32(1280), Height: ptr32(720)}, true},
		{"H264 Baseline + no audio", Metadata{VideoCodec: "h264", VideoProfile: "Baseline", Width: ptr32(640), Height: ptr32(480)}, true},
		{"H264 unknown profile (empty)", Metadata{VideoCodec: "h264", AudioCodec: "aac", Width: ptr32(1280), Height: ptr32(720)}, true},
		{"AVC1 alias", Metadata{VideoCodec: "avc1", VideoProfile: "High", AudioCodec: "aac", Width: ptr32(1920), Height: ptr32(1080)}, true},
		{"HEVC rejected", Metadata{VideoCodec: "hevc", VideoProfile: "Main", AudioCodec: "aac", Width: ptr32(1920), Height: ptr32(1080)}, false},
		{"AV1 rejected", Metadata{VideoCodec: "av1", AudioCodec: "aac", Width: ptr32(1920), Height: ptr32(1080)}, false},
		{"H264 + MP3 rejected", Metadata{VideoCodec: "h264", VideoProfile: "High", AudioCodec: "mp3", Width: ptr32(1920), Height: ptr32(1080)}, false},
		{"H264 High 10 rejected", Metadata{VideoCodec: "h264", VideoProfile: "High 10", AudioCodec: "aac", Width: ptr32(1920), Height: ptr32(1080)}, false},
		{"missing dimensions", Metadata{VideoCodec: "h264", VideoProfile: "High", AudioCodec: "aac"}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := PassthroughOK(tc.m); got != tc.want {
				t.Errorf("got %v want %v", got, tc.want)
			}
		})
	}
}
