import { describe, it, expect, beforeEach } from 'vitest';
import { taskTools } from './tasks.js';
import { getDb, closeDb } from './db.js';


describe('taskTools', () => {
    beforeEach(() => {
        // Ensure we start with a fresh in-memory DB for every test
        closeDb();
        // Reset database for each test
        const db = getDb();
        db.exec('DELETE FROM tasks');
        // Note: getDb handles table creation
    });

    describe('tasks_add and tasks_list', () => {
        it('should add and then list a task', async () => {
            await taskTools.tasks_add.handler({
                title: 'Study for Midterm',
                course: 'CS 341',
                dueDate: '2026-03-25T23:59:59Z'
            });

            const listJson = await taskTools.tasks_list.handler({});
            const tasks = JSON.parse(listJson);

            expect(tasks).toHaveLength(1);
            expect(tasks[0].title).toBe('Study for Midterm');
            expect(tasks[0].course).toBe('CS 341');
            expect(tasks[0].source).toBe('manual');
        });
    });

    describe('tasks_complete', () => {
        it('should mark a task as complete', async () => {
            const addRes = await taskTools.tasks_add.handler({ title: 'Finish Lab' });
            const { id } = JSON.parse(addRes);

            await taskTools.tasks_complete.handler({ id });

            const listJson = await taskTools.tasks_list.handler({ completed: true });
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

            await taskTools.tasks_add.handler({ title: 'Yesterday Task', dueDate: yesterday });
            await taskTools.tasks_add.handler({ title: 'Tomorrow Task', dueDate: tomorrow });
            await taskTools.tasks_add.handler({ title: 'No Date Task' });

            const planJson = await taskTools.plan_week.handler();
            const plan = JSON.parse(planJson);

            expect(plan.overdue).toHaveLength(1);
            expect(plan.thisWeek).toHaveLength(1);
            expect(plan.noDueDate).toHaveLength(1);
            expect(plan.overdue[0].title).toBe('Yesterday Task');
            expect(plan.thisWeek[0].title).toBe('Tomorrow Task');
        });
    });
});
