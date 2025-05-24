import '@testing-library/jest-dom';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  useSearchParams: () => ({
    get: jest.fn(),
  }),
  usePathname: () => '',
}));

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, ...props }) => {
    return <a {...props}>{children}</a>;
  };
});

// Suppress console errors during tests
console.error = jest.fn(); 