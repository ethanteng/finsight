/**
 * The teaser's switch to autoplay once it is on screen. The route and the
 * server-rendered markup are covered in teaser-video.test.tsx; this needs a
 * DOM. jsdom has no IntersectionObserver, so each test installs a fake one.
 */
import { act, render } from '@testing-library/react';
import { TeaserVideo } from '@/components/marketing/TeaserVideo';

let observers: FakeIntersectionObserver[] = [];

class FakeIntersectionObserver {
  observed: Element[] = [];
  disconnect = jest.fn();
  constructor(
    public callback: IntersectionObserverCallback,
    public options?: IntersectionObserverInit,
  ) {
    observers.push(this);
  }
  observe(element: Element) {
    this.observed.push(element);
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
}

/** Reports the player as on screen, or not, to the component's observer. */
function scroll(observer: FakeIntersectionObserver, isIntersecting: boolean) {
  act(() => {
    observer.callback(
      [{ isIntersecting, target: observer.observed[0] } as IntersectionObserverEntry],
      observer as unknown as IntersectionObserver,
    );
  });
}

const srcOf = (container: HTMLElement) => container.querySelector('iframe')!.getAttribute('src');

beforeEach(() => {
  observers = [];
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: FakeIntersectionObserver,
  });
});

afterEach(() => {
  Reflect.deleteProperty(window, 'IntersectionObserver');
  Reflect.deleteProperty(navigator, 'connection');
});

describe('TeaserVideo autoplay', () => {
  /* Plain autoplay would start as the lazy frame loads, well before it is seen. */
  it('loads the plain player, and swaps in autoplay the first time half of it is on screen', () => {
    const { container } = render(<TeaserVideo />);

    expect(srcOf(container)).toBe('/video/embed');
    expect(observers).toHaveLength(1);
    expect(observers[0].options?.threshold).toBe(0.5);
    expect(observers[0].observed).toEqual([container.querySelector('iframe')]);

    scroll(observers[0], false);
    expect(srcOf(container)).toBe('/video/embed');

    scroll(observers[0], true);
    expect(srcOf(container)).toBe('/video/embed?autoplay=1');
    expect(observers[0].disconnect).toHaveBeenCalled();

    // Scrolling away again doesn't take it back; the player carries on.
    scroll(observers[0], false);
    expect(srcOf(container)).toBe('/video/embed?autoplay=1');
  });

  it('keeps the same autoplay behavior for a feature-specific video item', () => {
    const { container } = render(<TeaserVideo configItem="cash-flow-video" />);

    expect(srcOf(container)).toBe('/video/embed?item=cash-flow-video');
    scroll(observers[0], true);
    expect(srcOf(container)).toBe('/video/embed?item=cash-flow-video&autoplay=1');
  });

  it('stops watching when the page goes', () => {
    const { unmount } = render(<TeaserVideo />);

    unmount();
    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it('leaves the player waiting for Play for anyone who asks for reduced motion', () => {
    const original = window.matchMedia;
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    try {
      const { container } = render(<TeaserVideo />);

      expect(observers).toHaveLength(0);
      expect(srcOf(container)).toBe('/video/embed');
    } finally {
      window.matchMedia = original;
    }
  });

  it('leaves the player waiting for Play for anyone saving data', () => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true },
    });
    const { container } = render(<TeaserVideo />);

    expect(observers).toHaveLength(0);
    expect(srcOf(container)).toBe('/video/embed');
  });

  it('leaves the player waiting for Play without IntersectionObserver', () => {
    Reflect.deleteProperty(window, 'IntersectionObserver');
    const { container } = render(<TeaserVideo />);

    expect(srcOf(container)).toBe('/video/embed');
  });
});
