package ffmpeg

import "strings"

// PassthroughOK reports whether the given source metadata is eligible to be
// HLS-packaged via `ffmpeg -c copy` without re-encoding. The browser-side
// constraint is hls.js / native HLS compatibility: H.264 video (any common
// profile) with either no audio or AAC. Container/profile/level variations
// that confuse hls.js fall back to a re-encode.
func PassthroughOK(m Metadata) bool {
	if m.Width == nil || m.Height == nil {
		return false
	}
	if !isH264(m.VideoCodec) {
		return false
	}
	if !isAllowedH264Profile(m.VideoProfile) {
		return false
	}
	return isAllowedAudio(m.AudioCodec)
}

func isH264(codec string) bool {
	c := strings.ToLower(strings.TrimSpace(codec))
	return c == "h264" || c == "avc1" || c == "avc"
}

func isAllowedH264Profile(profile string) bool {
	p := strings.ToLower(strings.TrimSpace(profile))
	if p == "" {
		// Some sources omit profile. Be permissive — if codec is h264 it almost
		// always plays in browsers; the worst case is the variant playlist
		// stutters and we re-encode on retry.
		return true
	}
	switch p {
	case "baseline", "constrained baseline",
		"main", "high",
		// extended is unusual but still h264
		"extended":
		return true
	}
	// Reject 10-bit / 4:4:4 etc — browsers can't decode them.
	return false
}

func isAllowedAudio(codec string) bool {
	c := strings.ToLower(strings.TrimSpace(codec))
	return c == "" || c == "aac"
}
