package main

import (
	"slices"
	"testing"
)

func TestOpenCommand(t *testing.T) {
	cases := []struct {
		goos     string
		wantName string
		wantArgs []string
	}{
		{"darwin", "open", []string{"http://x"}},
		{"windows", "rundll32", []string{"url.dll,FileProtocolHandler", "http://x"}},
		{"linux", "xdg-open", []string{"http://x"}},
	}
	for _, c := range cases {
		name, args := openCommand(c.goos, "http://x")
		if name != c.wantName || !slices.Equal(args, c.wantArgs) {
			t.Errorf("openCommand(%q) = %q %v, want %q %v", c.goos, name, args, c.wantName, c.wantArgs)
		}
	}
}

func TestNormalizeAddr(t *testing.T) {
	cases := []struct{ in, want string }{
		{":9100", ":9100"},
		{"0.0.0.0:9100", ":9100"},
		{"127.0.0.1:9100", ":9100"},
		{"localhost:8080", ":8080"},
	}
	for _, c := range cases {
		if got := normalizeAddr(c.in); got != c.want {
			t.Errorf("normalizeAddr(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
