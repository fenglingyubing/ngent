package opencode

import (
	"strings"
	"testing"
)

func TestWithLoopbackNoProxy(t *testing.T) {
	got := withLoopbackNoProxy([]string{
		"PATH=/usr/bin",
		"http_proxy=http://127.0.0.1:8118",
		"NO_PROXY=example.com,localhost",
		"no_proxy=internal.local",
	})

	values := make(map[string]string, len(got))
	for _, entry := range got {
		key, value, ok := strings.Cut(entry, "=")
		if !ok {
			continue
		}
		values[key] = value
	}

	if got, want := values["http_proxy"], "http://127.0.0.1:8118"; got != want {
		t.Fatalf("http_proxy = %q, want %q", got, want)
	}
	for _, key := range []string{"NO_PROXY", "no_proxy"} {
		value := values[key]
		if value == "" {
			t.Fatalf("%s is empty, want merged no_proxy entries", key)
		}
		for _, want := range []string{"example.com", "internal.local", "127.0.0.1", "localhost"} {
			if !containsCSVValue(value, want) {
				t.Fatalf("%s = %q, want to contain %q", key, value, want)
			}
		}
	}
}

func containsCSVValue(csv, want string) bool {
	for _, part := range strings.Split(csv, ",") {
		if strings.TrimSpace(part) == want {
			return true
		}
	}
	return false
}
