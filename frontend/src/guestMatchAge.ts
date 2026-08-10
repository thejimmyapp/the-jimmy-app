export const formatRelativeAge = (endTime: number, now = Math.floor(Date.now() / 1000)) => {
  const minutes = Math.max(0, Math.floor((now - endTime) / 60));
  return minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ago`;
};
