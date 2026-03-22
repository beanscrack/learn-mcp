import { describe, it, expect, beforeEach } from 'vitest';
import { taskHandlers } from './tasks.js';
import { getDb, closeDb } from './db.js';

describe('taskHandlers', () => {
    beforeEach(() => {
        closeDb();
        const db = getDb();
        db.exec('DELETE FROM tasks');
    });

    describe('tasks_add and tasks_list', () => {
        it('should add and then list a task', async () => {
            await taskHandlers.tasks_add({
                title: 'Study for Midterm',
                course: 'CS 341',
                dueDate: '2026-03-25T23:59:59Z'
            });

            const listJson = await taskHandlers.tasks_list({});
            const tasks = JSON.parse(listJson);

            expect(tasks).toHaveLength(1);
            expect(tasks[0].title).toBe('Study for Midterm');
            expect(tasks[0].course).toBe('CS 341');
            expect(tasks[0].source).toBe('manual');
        });
    });

    describe('tasks_complete', () => {
        it('should mark a task as complete', async () => {
            const addRes = await taskHandlers.tasks_add({ title: 'Finish Lab' });
            const { id } = JSON.parse(addRes);

            await taskHandlers.tasks_complete({ id });

            const listJson = await taskHandlers.tasks_list({ completed: true });
            const tasks = JSON.parse(listJson);

            expect(tasks).toHaveLength(1);
            expect(tasks[0].id).toBe(id);
            expect(tasks[0].completed).toBe(true);
        });
    });

    describe('plan_week', () => {
        it('should categorize tasks correctly', async () => {
            const now = new Date();
            const tomorrow = new Date(now.getTime() + 86400000).toISOString();
            const yesterday = new Date(now.getTime() - 86400000).toISOString();

            await taskHandlers.tasks_add({ title: 'Yesterday Task', dueDate: yesterday });
            await taskHandlers.tasks_add({ title: 'Tomorrow Task', dueDate: tomorrow });
            await taskHandlers.tasks_add({ title: 'No Date Task' });

            const planJson = await taskHandlers.plan_week();
            const plan = JSON.parse(planJson);

            expect(plan.overdue).toHaveLength(1);
            expect(plan.thisWeek).toHaveLength(1);
            expect(plan.noDueDate).toHaveLength(1);
            expect(plan.overdue[0].title).toBe('Yesterday Task');
            expect(plan.thisWeek[0].title).toBe('Tomorrow Task');
        });
    });
});
