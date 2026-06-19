/**
 * Lock por chave (mutex assíncrono em processo).
 *
 * Serializa o processamento por telefone para evitar a corrida de
 * read-modify-write do histórico: duas mensagens quase simultâneas do mesmo
 * paciente liam o mesmo histórico e a segunda sobrescrevia a primeira.
 *
 * Observação: é um lock em processo (suficiente para deploy single-instance,
 * que é o caso aqui). Para múltiplas instâncias, combinar com dedupe via Redis.
 */

const queues = new Map<string, Promise<unknown>>();

/**
 * Executa `task` garantindo que, para uma mesma `key`, as execuções ocorram
 * em série (FIFO). Chaves diferentes rodam em paralelo. Propaga retorno e erros.
 */
export function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  // Encadeia após o anterior (rode independentemente de ele ter falhado).
  const run = prev.then(task, task);
  // O "rabo" da fila ignora erros para não quebrar o encadeamento seguinte.
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  queues.set(key, tail);
  // Limpeza: se ninguém entrou na fila depois, remove a entrada.
  tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return run;
}
