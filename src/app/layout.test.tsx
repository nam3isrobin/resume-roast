import { describe, it, expect, vi } from 'vitest';
import RootLayout, { metadata } from './layout';

vi.mock('next/font/google', () => ({
  Geist: () => ({ variable: '--font-geist-sans' }),
  Geist_Mono: () => ({ variable: '--font-geist-mono' }),
}));

describe('RootLayout', () => {
  it('exports page metadata', () => {
    expect(metadata.title).toBe('ResumeRoast | AI-Powered ATS Resume Reviewer');
    expect(metadata.description).toContain('AI-powered feedback');
  });

  it('wraps children in an html/body shell with font variables', () => {
    const tree = RootLayout({ children: <main>content</main> } as never);

    expect(tree.type).toBe('html');
    expect(tree.props.lang).toBe('en');
    expect(tree.props.className).toContain('--font-geist-sans');
    expect(tree.props.className).toContain('--font-geist-mono');
    expect(tree.props.children.type).toBe('body');
  });
});
