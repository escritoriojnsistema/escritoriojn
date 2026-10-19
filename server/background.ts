import { waitUntil } from '@vercel/functions';

const pending=new Set<Promise<unknown>>();

/** Vercel retains the invocation; the long-lived Express server drains on shutdown. */
export function retainBackgroundTask(task:Promise<unknown>) {
  const tracked=task.catch(()=>{
    // Never include the error object: provider failures can contain credentials or PII.
    console.error(JSON.stringify({event:'background_task_failed'}));
  }).finally(()=>pending.delete(tracked));
  pending.add(tracked);
  waitUntil(tracked);
}

export async function drainBackgroundTasks() {
  await Promise.allSettled([...pending]);
}
