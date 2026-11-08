export const productName = 'vMix PDF Viewer';
export const isViewerInputTitle = title => /^(?:vMix )?PDF Viewer(?: @\d+)?$/.test(title || '');
export const isLegacyInputTitle = title => /^PDF Viewer(?: @\d+)?$/.test(title || '');
export const viewerInputTitle = (port, legacy = false) => `${legacy ? 'PDF Viewer' : productName} @${port}`;
