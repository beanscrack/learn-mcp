import { describe, it, expect } from 'vitest';
import { classifyDateEvent, DateType, Confidence } from './dateEvent.js';

describe('dateEvent utils', () => {
    describe('classifyDateEvent', () => {
        it('should classify "Due Date" as high confidence DUE', () => {
            const result = classifyDateEvent('Assignment 1 Due Date');
            expect(result.dateType).toBe(DateType.DUE);
            expect(result.confidence).toBe(Confidence.HIGH);
        });

        it('should classify "Midterm" as high confidence EXAM', () => {
            const result = classifyDateEvent('Midterm Exam');
            expect(result.dateType).toBe(DateType.EXAM);
            expect(result.confidence).toBe(Confidence.HIGH);
        });

        it('should classify "Lecture" as high confidence LECTURE', () => {
            const result = classifyDateEvent('CS 341 Lecture');
            expect(result.dateType).toBe(DateType.LECTURE);
            expect(result.confidence).toBe(Confidence.HIGH);
        });

        it('should infer from eventType if provided', () => {
            const result = classifyDateEvent('A1', '', 'Dropbox');
            expect(result.dateType).toBe(DateType.DUE);
            expect(result.confidence).toBe(Confidence.MEDIUM);
        });
    });
});
