module.exports = async () => {
  const services = globalThis.__TEST_SERVICES__;
  if (!services) return;

  const { mongo, redis, child } = services;
  if (child.exitCode === null) {
    await new Promise((resolve) => {
      child.once('exit', resolve);
      child.kill();
    });
  }
  await redis.close();
  await mongo.stop();
};
