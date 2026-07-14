import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { extractSources, parseInlineStyles, renderMarkdown } from './MarkdownUtils';

describe('MarkdownUtils', () => {
  describe('extractSources', () => {
    it('extracts markdown links correctly', () => {
      const text = 'Here is a [link](https://example.com) and another [one](http://test.com)';
      const sources = extractSources(text);
      expect(sources).toHaveLength(2);
      expect(sources[0]).toEqual({ text: 'link', url: 'https://example.com' });
      expect(sources[1]).toEqual({ text: 'one', url: 'http://test.com' });
    });

    it('returns empty array when no body', () => {
      expect(extractSources(undefined)).toEqual([]);
    });
  });

  describe('parseInlineStyles', () => {
    it('parses bold text', () => {
      const text = 'Some **bold** text';
      const result = parseInlineStyles(text);
      render(<div>{result}</div>);
      expect(screen.getByText('bold')).toHaveStyle({ fontWeight: 600 });
    });

    it('parses inline code', () => {
      const text = 'Some `code` text';
      const result = parseInlineStyles(text);
      render(<div>{result}</div>);
      expect(screen.getByText('code')).toHaveStyle({ fontFamily: 'var(--font-mono)' });
    });

    it('parses wikilinks', () => {
      const text = 'A [[test-node]] link';
      const result = parseInlineStyles(text);
      render(<BrowserRouter><div>{result}</div></BrowserRouter>);
      const link = screen.getByText('test-node');
      expect(link).toBeInTheDocument();
      expect(link.closest('a')).toHaveAttribute('href', '/memory?slug=test-node');
    });

    it('parses wikilinks with alias', () => {
      const text = 'A [[test-node|My Node]] link';
      const result = parseInlineStyles(text);
      render(<BrowserRouter><div>{result}</div></BrowserRouter>);
      const link = screen.getByText('My Node');
      expect(link).toBeInTheDocument();
      expect(link.closest('a')).toHaveAttribute('href', '/memory?slug=test-node');
    });
  });

  describe('renderMarkdown', () => {
    it('renders headers', () => {
      const text = '# H1\n## H2\n### H3';
      const result = renderMarkdown(text);
      render(<div>{result}</div>);
      expect(screen.getByText('H1').tagName).toBe('H3'); // Based on current code H1 -> h3
      expect(screen.getByText('H2').tagName).toBe('H4'); // H2 -> h4
      expect(screen.getByText('H3').tagName).toBe('H5'); // H3 -> h5
    });

    it('renders lists', () => {
      const text = '- Item 1\n* Item 2\n1. Item 3';
      const result = renderMarkdown(text);
      render(<div>{result}</div>);
      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
      expect(screen.getByText('Item 3')).toBeInTheDocument();
    });

    it('renders paragraphs with parsed inline styles', () => {
      const text = 'This is a paragraph with **bold** text.';
      const result = renderMarkdown(text);
      render(<div>{result}</div>);
      expect(screen.getByText('bold')).toBeInTheDocument();
      expect(screen.getByText('This is a paragraph with', { exact: false })).toBeInTheDocument();
    });
  });
});
