export const textUtils = {
  isText: (str: string) => str.trim().length > 0,
  filterLinesWithText: (lines: string[]) => lines.filter(textUtils.isText),
  excludeLinesThatInclude: (lines: string[], text: string) => lines.filter(line => !line.includes(text)),
  excludeLinesThatStartWith: (lines: string[], text: string) => lines.filter(line => !line.startsWith(text)),
}
