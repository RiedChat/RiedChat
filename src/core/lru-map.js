export const createLruMemo = (limit) => {
  const map = new Map();
  return (key, make) => {
    const value = map.has(key) ? map.get(key) : make();
    map.delete(key);
    map.set(key, value);
    if(map.size > limit) map.delete(map.keys().next().value);
    return value;
  };
};
