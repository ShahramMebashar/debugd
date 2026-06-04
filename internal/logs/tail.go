package logs

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// Tail watches dir for *.log files and emits each parsed entry. It seeds with
// the tail of the most-recent file, then polls every interval until ctx is
// done. Polling (no fsnotify) keeps the binary dependency-free and portable.
func Tail(ctx context.Context, dir string, interval time.Duration, emit func(Entry)) {
	t := newTailer(dir, emit)
	t.seed()

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			t.poll()
		}
	}
}

type fileState struct {
	offset  int64
	parser  *Parser
	partial string // trailing line not yet terminated by '\n'
}

type tailer struct {
	dir    string
	emit   func(Entry)
	nextID int64
	files  map[string]*fileState
}

func newTailer(dir string, emit func(Entry)) *tailer {
	return &tailer{dir: dir, emit: emit, files: map[string]*fileState{}}
}

func (t *tailer) glob() []string {
	m, _ := filepath.Glob(filepath.Join(t.dir, "*.log"))
	return m
}

// seed records each file's current size (so poll only emits new lines) and
// replays the recent tail of EVERY file for immediate context — oldest-modified
// first, so the newest file's lines get the highest IDs and sort newest-first.
func (t *tailer) seed() {
	type fileInfo struct {
		path string
		mod  time.Time
	}
	var files []fileInfo
	for _, f := range t.glob() {
		fi, err := os.Stat(f)
		if err != nil {
			continue
		}
		t.files[f] = &fileState{offset: fi.Size(), parser: NewParser(filepath.Base(f))}
		files = append(files, fileInfo{f, fi.ModTime()})
	}
	sort.Slice(files, func(i, j int) bool { return files[i].mod.Before(files[j].mod) })

	for _, in := range files {
		fs := t.files[in.path]
		for _, line := range tailLines(in.path, 100) {
			t.parseLine(fs, line)
		}
		t.flush(fs)
		// tailLines may have read past the size recorded above if the file grew
		// meanwhile; advance the offset so poll() doesn't re-emit those bytes.
		if fi, err := os.Stat(in.path); err == nil {
			fs.offset = fi.Size()
		}
	}
}

func (t *tailer) poll() {
	for _, f := range t.glob() {
		fs := t.files[f]
		if fs == nil {
			fs = &fileState{parser: NewParser(filepath.Base(f))}
			t.files[f] = fs
		}
		fi, err := os.Stat(f)
		if err != nil {
			delete(t.files, f)
			continue
		}
		size := fi.Size()
		if size < fs.offset { // truncated / rotated in place
			fs.offset, fs.partial = 0, ""
			fs.parser = NewParser(filepath.Base(f))
		}
		if size == fs.offset {
			continue
		}
		chunk, err := readAt(f, fs.offset, size-fs.offset)
		if err != nil {
			continue
		}
		fs.offset = size

		data := fs.partial + string(chunk)
		lines := strings.Split(data, "\n")
		fs.partial = lines[len(lines)-1] // last element has no terminating newline
		for _, line := range lines[:len(lines)-1] {
			t.parseLine(fs, line)
		}
		// Monolog writes whole records atomically, so the last complete record is
		// fully present — flush it now so it shows without waiting for the next.
		t.flush(fs)
	}
}

func (t *tailer) parseLine(fs *fileState, line string) {
	if e, ok := fs.parser.Push(line); ok {
		t.emitEntry(e)
	}
}

func (t *tailer) flush(fs *fileState) {
	if e, ok := fs.parser.Flush(); ok {
		t.emitEntry(e)
	}
}

func (t *tailer) emitEntry(e Entry) {
	t.nextID++
	e.ID = t.nextID
	t.emit(e)
}

// readAt reads exactly n bytes at offset off.
func readAt(path string, off, n int64) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	buf := make([]byte, n)
	got, err := f.ReadAt(buf, off)
	if errors.Is(err, io.EOF) {
		err = nil
	}
	return buf[:got], err
}

// tailLines returns up to the last n complete lines of a file, reading at most
// the final 256 KB so a huge log never blows memory.
func tailLines(path string, n int) []string {
	fi, err := os.Stat(path)
	if err != nil {
		return nil
	}
	const max = 256 * 1024
	off, size := int64(0), fi.Size()
	if size > max {
		off = size - max
	}
	chunk, err := readAt(path, off, size-off)
	if err != nil {
		return nil
	}
	s := string(chunk)
	if off > 0 { // drop the partial first line
		if i := strings.IndexByte(s, '\n'); i >= 0 {
			s = s[i+1:]
		}
	}
	s = strings.TrimRight(s, "\n")
	if s == "" {
		return nil
	}
	lines := strings.Split(s, "\n")
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	return lines
}
