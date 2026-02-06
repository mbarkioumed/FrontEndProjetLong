
export function multiplyMatrixVector(m, v) {
    // m is 4x4 (array of arrays), v is [x,y,z,w]
    const res = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            res[r] += m[r][c] * v[c];
        }
    }
    return res;
}

export function invertMatrix(m) {
    // Invert 4x4 matrix using Gaussian elimination or cofactor expansion.
    // Since this is for Affines, we can expect them to be invertible.
    // Implementation based on standard inverse algorithm.
    
    // Flatten input if needed or access directly. 
    // Assuming m is list of 4 lists.
    
    const a = m[0][0], b = m[0][1], c = m[0][2], d = m[0][3],
          e = m[1][0], f = m[1][1], g = m[1][2], h = m[1][3],
          i = m[2][0], j = m[2][1], k = m[2][2], l = m[2][3],
          mm = m[3][0], n = m[3][1], o = m[3][2], p = m[3][3];

    let q = f*k*p + g*l*n + h*j*o - h*k*n - g*j*p - f*l*o;
    let r = e*k*p + g*l*mm + h*i*o - h*k*mm - g*i*p - e*l*o;
    let s = e*j*p + f*l*mm + h*i*n - h*j*mm - f*i*p - e*l*n;
    let t = e*j*o + f*k*mm + g*i*n - g*j*mm - f*i*o - e*k*n;

    let det = a*q - b*r + c*s - d*t;

    if (det === 0) return null; // Singular

    const inv = new Array(4).fill(0).map(() => new Array(4).fill(0));
    const invDet = 1.0 / det;

    inv[0][0] = q * invDet;
    inv[0][1] = (b*k*p + c*l*n + d*j*o - d*k*n - c*j*p - b*l*o) * -invDet;
    inv[0][2] = (b*g*p + c*h*n + d*f*o - d*g*n - c*f*p - b*h*o) * invDet;
    inv[0][3] = (b*g*l + c*h*j + d*f*k - d*g*j - c*f*l - b*h*k) * -invDet;

    inv[1][0] = r * -invDet;
    inv[1][1] = (a*k*p + c*l*mm + d*i*o - d*k*mm - c*i*p - a*l*o) * invDet;
    inv[1][2] = (a*g*p + c*h*mm + d*e*o - d*g*mm - c*e*p - a*h*o) * -invDet;
    inv[1][3] = (a*g*l + c*h*i + d*e*k - d*g*i - c*e*l - a*h*k) * invDet;

    inv[2][0] = s * invDet;
    inv[2][1] = (a*j*p + b*l*mm + d*i*n - d*j*mm - b*i*p - a*l*n) * -invDet;
    inv[2][2] = (a*f*p + b*h*mm + d*e*n - d*f*mm - b*e*p - a*h*n) * invDet;
    inv[2][3] = (a*f*l + b*h*i + d*e*j - d*f*i - b*e*l - a*h*j) * -invDet;

    inv[3][0] = t * -invDet;
    inv[3][1] = (a*j*o + b*k*mm + c*i*n - c*j*mm - b*i*o - a*k*n) * invDet;
    inv[3][2] = (a*f*o + b*g*mm + c*e*n - c*g*mm - b*e*o - a*f*n) * -invDet;
    inv[3][3] = (a*f*k + b*g*i + c*e*j - c*g*i - b*e*k - a*f*j) * invDet;

    return inv;
}
