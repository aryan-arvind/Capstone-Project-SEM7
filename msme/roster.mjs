// The department/agent roster as the engine sees it, read from the one config file.
import ROSTER from './config/roster.json' with { type: 'json' };

export { ROSTER };
export const DEPARTMENTS = ROSTER.departments;
export const DECISION_DEPTS = DEPARTMENTS.filter(d => d.key !== 'arbiter');
export const dept = key => DEPARTMENTS.find(d => d.key === key);
export const agentIdOf = key => dept(key).agent.id;
export const deptOfAgent = id => DECISION_DEPTS.find(d => d.agent.id === id)?.key;
export const agentName = id => { for (const d of DEPARTMENTS) for (const a of [d.agent, ...d.desks]) if (a.id === id) return a.name.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()); return id; };
