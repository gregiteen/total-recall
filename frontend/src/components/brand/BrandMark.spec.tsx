import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BrandMark, { BrandChip } from './BrandMark';

describe('BrandMark', () => {
  it('renders with default lockup variant', () => {
    render(<BrandMark />);
    const img = screen.getByAltText('Total Recall');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/brand/total-recall-lockup.png');
  });

  it('renders icon variant with square dimensions', () => {
    render(<BrandMark variant="icon" height={48} />);
    const img = screen.getByAltText('Total Recall');
    expect(img).toHaveAttribute('src', '/brand/total-recall-icon.svg');
    expect(img.style.width).toBe('48px');
    expect(img.style.height).toBe('48px');
  });

  it('renders badge variant', () => {
    render(<BrandMark variant="badge" />);
    const img = screen.getByAltText('Total Recall');
    expect(img).toHaveAttribute('src', '/brand/total-recall-badge.jpg');
  });

  it('renders mark variant', () => {
    render(<BrandMark variant="mark" />);
    const img = screen.getByAltText('Total Recall');
    expect(img).toHaveAttribute('src', '/brand/total-recall-mark.svg');
  });

  it('wraps in plate div when plate=true', () => {
    render(<BrandMark plate />);
    const plate = document.querySelector('.brand-plate');
    expect(plate).toBeInTheDocument();
  });

  it('does not render plate when plate=false', () => {
    render(<BrandMark />);
    const plate = document.querySelector('.brand-plate');
    expect(plate).not.toBeInTheDocument();
  });

  it('accepts custom alt text', () => {
    render(<BrandMark alt="Custom Alt" />);
    expect(screen.getByAltText('Custom Alt')).toBeInTheDocument();
  });

  it('accepts custom className', () => {
    render(<BrandMark className="test-class" />);
    const img = screen.getByAltText('Total Recall');
    expect(img.className).toContain('test-class');
  });
});

describe('BrandChip', () => {
  it('renders with default size', () => {
    render(<BrandChip />);
    const chip = document.querySelector('.brand-chip') as HTMLElement | null;
    expect(chip).toBeInTheDocument();
    expect(chip?.style.width).toBe('36px');
    expect(chip?.style.height).toBe('36px');
  });

  it('renders with custom size', () => {
    render(<BrandChip size={64} />);
    const chip = document.querySelector('.brand-chip') as HTMLElement | null;
    expect(chip?.style.width).toBe('64px');
    expect(chip?.style.height).toBe('64px');
  });
});
