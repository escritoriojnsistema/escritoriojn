export interface ProjectInfo {
  name: string;
  version: string;
  stack: string[];
}

export function getProjectInfo(): ProjectInfo {
  return {
    name: 'React + Vite Base',
    version: '1.0.0',
    stack: ['React 19', 'Vite 8', 'TypeScript', 'Tailwind CSS'],
  };
}

export function formatStackList(stack: string[]): string {
  if (!stack || stack.length === 0) {
    return 'Nenhuma tecnologia informada';
  }
  return stack.join(' • ');
}
