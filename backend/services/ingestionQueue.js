let queuePromise;

async function getQueue() {
  if (!queuePromise) {
    queuePromise = import('p-queue').then(({ default: PQueue }) => new PQueue({ concurrency: 2 }));
  }
  return queuePromise;
}

async function enqueue(task) {
  const queue = await getQueue();
  return queue.add(task);
}

module.exports = {
  enqueue,
};
