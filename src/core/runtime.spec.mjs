import { describe, it, expect } from 'vitest';
import { cleanAndParseJSON } from './runtime.mjs';

describe('cleanAndParseJSON', () => {
  it('parses standard clean JSON', () => {
    const input = '{"name": "John", "age": 30, "active": true}';
    expect(cleanAndParseJSON(input)).toEqual({
      name: 'John',
      age: 30,
      active: true
    });
  });

  it('extracts and parses JSON wrapped in markdown code blocks', () => {
    const inputWithJsonTag = '```json\n{"name": "John"}\n```';
    expect(cleanAndParseJSON(inputWithJsonTag)).toEqual({ name: 'John' });

    const inputWithoutJsonTag = '```\n{"name": "Doe"}\n```';
    expect(cleanAndParseJSON(inputWithoutJsonTag)).toEqual({ name: 'Doe' });
  });

  it('ignores conversational text prefixing the JSON payload', () => {
    const input = 'Here is the response you asked for:\n{"name": "John"}';
    expect(cleanAndParseJSON(input)).toEqual({ name: 'John' });
  });

  it('strips single-line and multi-line comments outside of strings', () => {
    const input = `
      // This is a comment
      {
        "name": "John", /* This is a multi-line
        comment */
        "age": 30 // another comment
      }
    `;
    expect(cleanAndParseJSON(input)).toEqual({
      name: 'John',
      age: 30
    });
  });

  it('strips single slash comment/bullet typos outside of strings', () => {
    const input = `
      {
        "name": "John",
        / "age": 30
      }
    `;
    expect(cleanAndParseJSON(input)).toEqual({
      name: 'John'
    });
  });

  it('does NOT strip comment-like patterns inside string literals', () => {
    const input = '{"url": "https://example.com/api", "text": "This is a // comment inside a string"}';
    expect(cleanAndParseJSON(input)).toEqual({
      url: 'https://example.com/api',
      text: 'This is a // comment inside a string'
    });
  });

  it('removes stray trailing commas in objects and arrays', () => {
    const input = '{"hobbies": ["coding", "reading",], "user": {"id": 1,},}';
    expect(cleanAndParseJSON(input)).toEqual({
      hobbies: ['coding', 'reading'],
      user: { id: 1 }
    });
  });

  it('filters out LLM placeholder lines outside actual string content', () => {
    const input = `
      {
        "name": "John",
        _
        ...
        "age": 30
      }
    `;
    expect(cleanAndParseJSON(input)).toEqual({
      name: 'John',
      age: 30
    });
  });

  it('quotes unquoted keys', () => {
    const input = '{name: "John", age: 30, user-id: "123"}';
    expect(cleanAndParseJSON(input)).toEqual({
      name: 'John',
      age: 30,
      'user-id': '123'
    });
  });

  it('normalizes single-quoted strings to double-quoted strings', () => {
    const input = "{'name': 'John', 'escape': 'don\\'t', 'nested': \"value\"}";
    expect(cleanAndParseJSON(input)).toEqual({
      name: 'John',
      escape: "don't",
      nested: 'value'
    });
  });

  it('quotes unquoted string values (excluding keywords and numbers)', () => {
    const input = '{status: pending, value: LK-99, active: true, score: 98.6}';
    expect(cleanAndParseJSON(input)).toEqual({
      status: 'pending',
      value: 'LK-99',
      active: true,
      score: 98.6
    });
  });

  it('auto-balances unclosed brackets and braces for truncated JSON payloads', () => {
    const truncatedObject = '{"name": "John", "hobbies": ["coding", "reading"';
    expect(cleanAndParseJSON(truncatedObject)).toEqual({
      name: 'John',
      hobbies: ['coding', 'reading']
    });

    const truncatedArray = '[{"name": "John"}, {"name": "Doe"';
    expect(cleanAndParseJSON(truncatedArray)).toEqual([
      { name: 'John' },
      { name: 'Doe' }
    ]);
  });
});
