/** Cryptographically random password for the add/edit modal. */
export function generatePassword(options?: {
  length?: number;
  uppercase?: boolean;
  lowercase?: boolean;
  numbers?: boolean;
  symbols?: boolean;
}): string {
  const length = Math.min(128, Math.max(8, options?.length ?? 20));
  const uppercase = options?.uppercase !== false;
  const lowercase = options?.lowercase !== false;
  const numbers = options?.numbers !== false;
  const symbols = options?.symbols !== false;

  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const nums = "23456789";
  const syms = "!@#$%^&*-_=+?";

  let alphabet = "";
  const required: string[] = [];
  if (uppercase) {
    alphabet += upper;
    required.push(upper[Math.floor(Math.random() * upper.length)]);
  }
  if (lowercase) {
    alphabet += lower;
    required.push(lower[Math.floor(Math.random() * lower.length)]);
  }
  if (numbers) {
    alphabet += nums;
    required.push(nums[Math.floor(Math.random() * nums.length)]);
  }
  if (symbols) {
    alphabet += syms;
    required.push(syms[Math.floor(Math.random() * syms.length)]);
  }
  if (!alphabet) {
    alphabet = lower + nums;
    required.push(lower[0], nums[0]);
  }

  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  const chars: string[] = [];
  for (let i = 0; i < length; i++) {
    chars.push(alphabet[bytes[i]! % alphabet.length]!);
  }
  // Ensure at least one of each selected class
  for (let i = 0; i < required.length && i < length; i++) {
    chars[i] = required[i]!;
  }
  // Shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = bytes[i]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}
