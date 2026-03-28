const listeners: Array<(data: { x: number; y: number; z: number }) => void> = [];

export const Accelerometer = {
  setUpdateInterval: jest.fn(),
  addListener: jest.fn((callback: (data: { x: number; y: number; z: number }) => void) => {
    listeners.push(callback);
    return { remove: jest.fn(() => {
      const idx = listeners.indexOf(callback);
      if (idx >= 0) listeners.splice(idx, 1);
    }) };
  }),
  _simulateData: (data: { x: number; y: number; z: number }) => {
    listeners.forEach((cb) => cb(data));
  },
  _reset: () => {
    listeners.length = 0;
  },
};
