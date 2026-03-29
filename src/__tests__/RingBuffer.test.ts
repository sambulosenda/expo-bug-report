import { RingBuffer } from '../RingBuffer';

describe('RingBuffer', () => {
  it('stores items up to max size', () => {
    const buffer = new RingBuffer<number>(3);
    buffer.push(1);
    buffer.push(2);
    buffer.push(3);
    expect(buffer.getAll()).toEqual([1, 2, 3]);
    expect(buffer.length).toBe(3);
  });

  it('evicts oldest item when full', () => {
    const buffer = new RingBuffer<number>(3);
    buffer.push(1);
    buffer.push(2);
    buffer.push(3);
    buffer.push(4);
    expect(buffer.getAll()).toEqual([2, 3, 4]);
    expect(buffer.length).toBe(3);
  });

  it('returns empty array when no items', () => {
    const buffer = new RingBuffer<string>(5);
    expect(buffer.getAll()).toEqual([]);
    expect(buffer.length).toBe(0);
  });

  it('returns a copy, not a reference', () => {
    const buffer = new RingBuffer<number>(3);
    buffer.push(1);
    const copy = buffer.getAll();
    copy.push(999);
    expect(buffer.getAll()).toEqual([1]);
  });

  it('clears all items', () => {
    const buffer = new RingBuffer<number>(3);
    buffer.push(1);
    buffer.push(2);
    buffer.clear();
    expect(buffer.getAll()).toEqual([]);
    expect(buffer.length).toBe(0);
  });
});
