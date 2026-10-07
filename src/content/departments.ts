import type { DepartmentDef } from '../engine/types';

// §3 hex 1+6. slot: 'center' or 0..5 clockwise from top.
export const DEPARTMENTS: DepartmentDef[] = [
  { id: 'engineering', name: 'Engineering', slot: 0, adjacency: ['operations', 'people', 'product'] },
  { id: 'product',     name: 'Product',     slot: 1, adjacency: ['operations', 'engineering', 'sales'] },
  { id: 'sales',       name: 'Sales',       slot: 2, adjacency: ['operations', 'product', 'marketing'] },
  { id: 'marketing',   name: 'Marketing',   slot: 3, adjacency: ['operations', 'sales', 'finance'] },
  { id: 'finance',     name: 'Finance',     slot: 4, adjacency: ['operations', 'marketing', 'people'] },
  { id: 'people',      name: 'People & HR', slot: 5, adjacency: ['operations', 'finance', 'engineering'] },
  { id: 'operations',  name: 'Operations',  slot: 'center', adjacency: ['engineering', 'product', 'sales', 'marketing', 'finance', 'people'] },
];

// §83 mini prototype: 4 adjacent hexes  A / B C / D
export const MINI_DEPARTMENTS: DepartmentDef[] = [
  { id: 'engineering', name: 'Engineering', slot: 0, adjacency: ['product', 'sales'] },
  { id: 'product',     name: 'Product',     slot: 4, adjacency: ['engineering', 'sales', 'operations'] },
  { id: 'sales',       name: 'Sales',       slot: 2, adjacency: ['engineering', 'product', 'operations'] },
  { id: 'operations',  name: 'Operations',  slot: 'center', adjacency: ['product', 'sales'] },
];
