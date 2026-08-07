export const maskWallet = (address) => {
  if (!address || typeof address !== 'string') return '???';
  if (address.length < 6) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};