package com.rpg.soundscape;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.ChecksumException;
import com.google.zxing.FormatException;
import com.google.zxing.NotFoundException;
import com.google.zxing.WriterException;
import com.google.zxing.RGBLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeReader;
import com.google.zxing.qrcode.QRCodeWriter;

import org.junit.Test;

import java.util.Map;

/**
 * The desktop UI renders its pairing QR codes. This test decodes such a QR
 * through the very engine the in-app scanner uses (zxing core with default
 * hints, like zxing-android-embedded's CaptureManager) and pins the color
 * polarity the scanner can actually read.
 */
public class QrPolarityTest {
    private static final String URL =
            "http://192.168.0.2:8000/api/library/export?token=_eydPaK9DGvd5nxdrF_-Mku4tvV214vdrvpBPqXT-No&transfer=library";

    // Colors the desktop modal historically used: gold modules on dark navy.
    private static final int LEGACY_BG = 0xFF151922;
    private static final int LEGACY_FG = 0xFFEAB308;

    // Colors that match QR spec: dark modules on a light quiet zone.
    private static final int LIGHT_BG = 0xFFF8FAFC;
    private static final int LIGHT_FG = 0xFF151922;

    @Test
    public void legacyGoldOnDarkQrIsNotDecodedByDefault() {
        // Documents why phones failed to scan the desktop QR: without the
        // (opt-in, newer-zxing-only) inverted mode, the decoder expects dark
        // modules on a light background.
        try {
            decode(render(LEGACY_BG, LEGACY_FG));
            fail("zxing unexpectedly decoded the inverted QR");
        } catch (NotFoundException | ChecksumException | FormatException | WriterException expected) {
            // inverted polarity is unreadable with default hints
        }
    }

    @Test
    public void darkOnLightQrDecodesToTheOriginalUrl()
            throws NotFoundException, ChecksumException, FormatException, WriterException {
        Result result = decode(render(LIGHT_BG, LIGHT_FG));
        assertEquals(URL, result.getText());
    }

    private static RenderedQr render(int bgColor, int fgColor)
            throws WriterException {
        QRCodeWriter writer = new QRCodeWriter();
        BitMatrix matrix = writer.encode(URL, BarcodeFormat.QR_CODE, 33, 33, Map.of());
        int width = matrix.getWidth();
        int height = matrix.getHeight();
        int[] pixels = new int[width * height];
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                pixels[y * width + x] = matrix.get(x, y) ? fgColor : bgColor;
            }
        }
        return new RenderedQr(pixels, width, height);
    }

    private static Result decode(RenderedQr qr)
            throws NotFoundException, ChecksumException, FormatException, com.google.zxing.WriterException {
        RGBLuminanceSource source = new RGBLuminanceSource(qr.width, qr.height, qr.pixels);
        BinaryBitmap bitmap = new BinaryBitmap(new HybridBinarizer(source));
        return new QRCodeReader().decode(bitmap);
    }

    private static final class RenderedQr {
        final int[] pixels;
        final int width;
        final int height;

        RenderedQr(int[] pixels, int width, int height) {
            this.pixels = pixels;
            this.width = width;
            this.height = height;
        }
    }
}
