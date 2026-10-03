type ProjectRef = { id: string; title: string };

export interface TaskGroup<T> {
    key: string;
    title: string;
    project: ProjectRef | null;
    tasks: T[];
}

/** Groups tasks under their project (sorted by title), with project-less tasks in a trailing "Practice" group. */
export function groupTasksByProject<T extends { project: ProjectRef | null }>(tasks: readonly T[]): TaskGroup<T>[] {
    const byProject = new Map<string, TaskGroup<T>>();
    const practice: T[] = [];

    for (const task of tasks) {
        if (!task.project) {
            practice.push(task);
            continue;
        }
        const group = byProject.get(task.project.id);
        if (group) group.tasks.push(task);
        else byProject.set(task.project.id, { key: task.project.id, title: task.project.title, project: task.project, tasks: [task] });
    }

    const groups = [...byProject.values()].sort((a, b) => a.title.localeCompare(b.title));
    if (practice.length > 0) groups.push({ key: "practice", title: "Practice", project: null, tasks: practice });
    return groups;
}
