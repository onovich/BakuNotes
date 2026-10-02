export function pickTextFolder(): Promise<globalThis.File[]> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true; input.setAttribute('webkitdirectory', '');
    input.hidden = true; document.body.appendChild(input);
    const finish = (files: globalThis.File[]) => { input.remove(); resolve(files); };
    input.onchange = () => finish(Array.from(input.files || []));
    input.oncancel = () => finish([]);
    input.click();
  });
}
