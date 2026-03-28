export const GestureDetector = 'GestureDetector';
export const GestureHandlerRootView = 'GestureHandlerRootView';
export const Gesture = {
  Pan: () => ({
    onStart: jest.fn().mockReturnThis(),
    onUpdate: jest.fn().mockReturnThis(),
    onEnd: jest.fn().mockReturnThis(),
    minDistance: jest.fn().mockReturnThis(),
  }),
};
