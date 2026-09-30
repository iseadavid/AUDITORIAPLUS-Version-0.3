import { openDB } from 'idb';  
  
export async function processOfflineQueue() {  
  const db = await openDB('AuditDB', 1);  
  const tx = db.transaction('offline_events_queue', 'readonly');  
  const store = tx.objectStore('offline_events_queue');  
    
  const events = await store.getAll();  
  events.sort((a, b) => new Date(a.timestamp_utc).getTime() - new Date(b.timestamp_utc).getTime());  
  
  for (const event of events) {  
    try {  
      const response = await fetch('/api/v1/audit/register-count', {  
        method: 'POST',  
        headers: {  
          'Content-Type': 'application/json',  
          'Authorization': `Bearer ${localStorage.getItem('jwt')}`  
        },  
        body: JSON.stringify(event.payload)  
      });  
  
      if (response.ok || response.status === 409) {  
        const deleteTx = db.transaction('offline_events_queue', 'readwrite');  
        await deleteTx.objectStore('offline_events_queue').delete(event.eventId);  
      }  
    } catch (error) {  
      console.error('Error de red al sincronizar evento offline:', error);  
      break; 
    }  
  }  
}  
  
window.addEventListener('online', () => {  
  console.log('Conexión reestablecida. Iniciando sincronización de cola offline...');  
  processOfflineQueue();  
});
