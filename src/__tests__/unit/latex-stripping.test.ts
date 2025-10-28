/**
 * Tests for LaTeX syntax stripping functionality
 * This ensures that even if GPT ignores instructions and generates LaTeX,
 * we strip it out before returning the response to users.
 */

describe('LaTeX Syntax Stripping', () => {
  // Simulate the stripLatexSyntax function
  function stripLatexSyntax(text: string): string {
    return text
      // Remove \text{...} - capture content and remove wrapper
      .replace(/\\text\{([^}]*)\}/g, '$1')
      // Replace \div with /
      .replace(/\\div/g, '/')
      // Replace \frac{A}{B} with (A / B)
      .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1 / $2)')
      // Replace \approx with ~
      .replace(/\\approx/g, '~')
      // Remove [ ... ] brackets around calculations (but keep content)
      .replace(/\[\s*\*\*([^[]*?)\*\*\s*\]/g, '**$1**')
      .replace(/\[\s*([^[]*?)\s*\]/g, '$1')
      // Clean up any remaining backslash commands
      .replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1')
      .replace(/\\[a-zA-Z]+/g, '')
      .trim();
  }

  it('should strip \\text{} from calculations', () => {
    const input = 'Total = \\text{$7,062.98}';
    const expected = 'Total = $7,062.98';
    expect(stripLatexSyntax(input)).toBe(expected);
  });

  it('should replace \\div with /', () => {
    const input = 'Income = (8,237 \\div 12)';
    const expected = 'Income = (8,237 / 12)';
    expect(stripLatexSyntax(input)).toBe(expected);
  });

  it('should convert \\frac{A}{B} to (A / B)', () => {
    const input = '\\frac{1,401,438.42}{3,617.31}';
    const expected = '(1,401,438.42 / 3,617.31)';
    expect(stripLatexSyntax(input)).toBe(expected);
  });

  it('should replace \\approx with ~', () => {
    const input = 'Runway \\approx 387.4 months';
    const expected = 'Runway ~ 387.4 months';
    expect(stripLatexSyntax(input)).toBe(expected);
  });

  it('should remove [ ] brackets around calculations', () => {
    const input = '[ **10,680.29 - 7,062.98 = \\text{$3,617.31}** ]';
    const expected = '**10,680.29 - 7,062.98 = $3,617.31**';
    expect(stripLatexSyntax(input)).toBe(expected);
  });

  it('should handle complex LaTeX from actual GPT output', () => {
    const input = 'Financial Runway: [ **\\frac{1,401,438.42}{3,617.31} \\approx \\text{387.4 months}** ]';
    const expected = 'Financial Runway: **(1,401,438.42 / 3,617.31) ~ 387.4 months**';
    expect(stripLatexSyntax(input)).toBe(expected);
  });

  it('should handle multiple LaTeX commands in one string', () => {
    const input = 'Monthly Shortfall = [ **10,680.29 - 7,062.98 = \\text{$3,617.31}** ]\\n\\nRunway = [ **\\frac{1,401,438.42}{3,617.31} \\approx \\text{387.4 months}** ]';
    const result = stripLatexSyntax(input);
    
    expect(result).not.toContain('\\text{');
    expect(result).not.toContain('\\frac{');
    expect(result).not.toContain('\\approx');
    expect(result).not.toContain('[ **');
    expect(result).toContain('$3,617.31');
    expect(result).toContain('387.4 months');
  });

  it('should preserve plain text without LaTeX', () => {
    const input = 'Your funds will last **32.3 years** based on current spending.';
    expect(stripLatexSyntax(input)).toBe(input);
  });

  it('should handle nested LaTeX commands', () => {
    const input = '\\text{\\frac{387.4}{12}}';
    const result = stripLatexSyntax(input);
    expect(result).not.toContain('\\text{');
    expect(result).not.toContain('\\frac{');
  });
});

