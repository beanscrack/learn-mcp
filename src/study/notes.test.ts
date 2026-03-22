import { describe, it, expect } from 'vitest';
import { chunkText, extractKeywords, buildFtsQuery } from './notes.js';

describe('note utils', () => {
    describe('chunkText', () => {
        it('should split text into chunks of roughly 400 words', () => {
            const words = Array(1000).fill('word').join(' ');
            const chunks = chunkText(words);
            expect(chunks).toHaveLength(3);
            expect(chunks[0].split(' ')).toHaveLength(400);
            expect(chunks[2].split(' ')).toHaveLength(200);
        });

        it('should handle empty text', () => {
            expect(chunkText('')).toHaveLength(0);
        });
    });

    describe('extractKeywords', () => {
        it('should extract common keywords and filter stop words', () => {
            const text = "The quick brown fox jumps over the lazy dog in Waterloo";
            const keywords = extractKeywords(text);
            // STOP_WORDS: the, in...
            // filtered words (>3 chars): quick, brown, jumps, over, lazy, waterloo
            expect(keywords).toContain('quick');
            expect(keywords).toContain('waterloo');
            expect(keywords).not.toContain('the');
            expect(keywords).not.toContain('fox'); // 3 chars
        });

        it('should limit to 8 keywords', () => {
            const text = "oneone twotwo threethree fourfour fivefive sixsix sevenseven eighteight ninenine tenten";
            expect(extractKeywords(text)).toHaveLength(8);
        });
    });

    describe('buildFtsQuery', () => {
        it('should build a valid SQLite FTS query string', () => {
            const terms = ['waterloo', 'study'];
            expect(buildFtsQuery(terms)).toBe('waterloo* OR study*');
        });

        it('should sanitize characters', () => {
            const terms = ['it\'s', 'cool!'];
            expect(buildFtsQuery(terms)).toBe('its* OR cool*');
        });
    });
});
