import { createBoard, type BoardOptions } from '../board/board';
import { makeMockView } from './mockView';
import type { EmployeeId } from '../engine/types';

const board = createBoard(document.getElementById('board')!);
const out = document.getElementById('out')!;
let mode: 'full' | 'mini' = 'full';
let view = makeMockView(mode);
let subset = false, highlight = false, focusIdx = -1;
let selected: EmployeeId | null = null;

const render = () => {
  const opts: BoardOptions = {
    selected,
    // e.g. "Manage": only employees in the viewer's own departments
    selectable: subset ? view.employees.filter((e) => view.departments.find((d) => d.id === e.deptId)?.teamLead === view.viewer).map((e) => e.id) : undefined,
    highlightDepts: highlight ? [view.departments[0].id] : [],
  };
  board.update(view, opts);
};

board.onEmployeeClick((id) => { console.log('employee click', id); selected = selected === id ? null : id; out.textContent = `clicked ${id}`; render(); });
board.onDeptClick((id) => { console.log('dept click', id); out.textContent = `dept ${id}`; });
board.onEmployeeHover((id) => console.log('hover', id));

document.getElementById('mode')!.onclick = () => { mode = mode === 'full' ? 'mini' : 'full'; view = makeMockView(mode); selected = null; focusIdx = -1; board.focusDept(null); render(); };
document.getElementById('sel')!.onclick = () => { subset = !subset; render(); };
document.getElementById('hl')!.onclick = () => { highlight = !highlight; render(); };
document.getElementById('focus')!.onclick = () => {
  focusIdx = focusIdx + 1 >= view.departments.length ? -1 : focusIdx + 1;
  board.focusDept(focusIdx < 0 ? null : view.departments[focusIdx].id);
};
render();
Object.assign(window, { board, makeMockView });
