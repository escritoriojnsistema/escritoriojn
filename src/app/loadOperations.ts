// Cache only executable code, never authenticated responses or page state.
let pending:ReturnType<typeof importOperations>|undefined;
function importOperations(){return import('./OperationalRoutes');}
export function loadOperations(){return pending??=importOperations().catch(error=>{pending=undefined;throw error;});}
