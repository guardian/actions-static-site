package store

import "errors"

type Store interface {
	Get(key string) ([]byte, error)
}

type MemoryStore map[string][]byte

func (ms MemoryStore) Get(key string) ([]byte, error) {
	got, ok := ms[key]
	if !ok {
		return nil, errors.New("not found")
	}

	return got, nil
}
