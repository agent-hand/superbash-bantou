// 結果は stdout に JSON で 1 つ出す。
export function writeJson(value: unknown, stream: { write(s: string): unknown } = process.stdout): void {
  stream.write(JSON.stringify(value, null, 2) + '\n');
}
