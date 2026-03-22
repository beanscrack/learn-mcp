import { describe, it, expect } from 'vitest';
import { stripHtml, marshalAssignment } from './marshal.js';

describe('marshal utils', () => {
    describe('stripHtml', () => {
        it('should remove HTML tags', () => {
            expect(stripHtml('<p>Hello <b>World</b></p>')).toBe('Hello World');
        });

        it('should decode common entities', () => {
            expect(stripHtml('A &amp; B &lt; C')).toBe('A & B < C');
        });

        it('should handle empty/null input', () => {
            expect(stripHtml(null)).toBe('');
            expect(stripHtml(undefined)).toBe('');
        });

        it('should handle nested tags', () => {
            expect(stripHtml('<div><p>Deep <span>text</span></p></div>')).toBe('Deep text');
        });

        it('should handle multiple entities', () => {
            expect(stripHtml('A &lt; B &amp;&amp; C &gt; D')).toBe('A < B && C > D');
        });
    });

    describe('marshalAssignment', () => {
        it('should convert raw assignment to simple format', () => {
            const raw = {
                Id: 123,
                Name: 'Test Assignment',
                DueDate: '2026-03-25T23:59:59.000Z',
                CustomInstructions: { Text: 'Do it', Html: '<b>Do it</b>' },
                Assessment: { ScoreDenominator: 100 },
                Attachments: [],
                LinkAttachments: [],
                AllowableFileType: 0,
                CustomAllowableFileTypes: null,
            };
            const result = marshalAssignment(raw);
            expect(result.id).toBe(123);
            expect(result.name).toBe('Test Assignment');
            expect(result.points).toBe(100);
            expect(result.instructions).toBe('Do it');
        });
    });
});
