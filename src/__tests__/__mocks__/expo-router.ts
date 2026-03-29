let _pathname = '/';
let _segments: string[] = [];

export const usePathname = jest.fn(() => _pathname);
export const useSegments = jest.fn(() => _segments);

export function __setPathname(pathname: string): void {
  _pathname = pathname;
}

export function __setSegments(segments: string[]): void {
  _segments = segments;
}
