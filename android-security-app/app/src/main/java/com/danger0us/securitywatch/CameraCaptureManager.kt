package com.danger0us.securitywatch

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureFailure
import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.TotalCaptureResult
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.util.Size
import androidx.core.content.ContextCompat
import java.io.File
import java.io.FileOutputStream

/**
 * Captures a single still photo from the front-facing camera using Camera2 directly
 * (no Activity/LifecycleOwner needed), so it can run from a foreground Service.
 */
object CameraCaptureManager {

    private const val TAG = "CameraCaptureManager"

    fun captureFrontSelfie(context: Context, onResult: (File?) -> Unit) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED
        ) {
            Log.w(TAG, "Camera permission not granted, cannot capture")
            onResult(null)
            return
        }

        val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val frontCameraId = findFrontCameraId(cameraManager)
        if (frontCameraId == null) {
            Log.w(TAG, "No front-facing camera found")
            onResult(null)
            return
        }

        val backgroundThread = HandlerThread("SecurityWatchCamera").apply { start() }
        val backgroundHandler = Handler(backgroundThread.looper)
        var resultDelivered = false

        fun deliver(file: File?) {
            if (resultDelivered) return
            resultDelivered = true
            onResult(file)
        }

        fun cleanup(device: CameraDevice?, session: CameraCaptureSession?, imageReader: android.media.ImageReader?) {
            try { session?.close() } catch (_: Exception) {}
            try { device?.close() } catch (_: Exception) {}
            try { imageReader?.close() } catch (_: Exception) {}
            backgroundThread.quitSafely()
        }

        try {
            val characteristics = cameraManager.getCameraCharacteristics(frontCameraId)
            val jpegSizes = characteristics
                .get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                ?.getOutputSizes(ImageFormat.JPEG)
            val targetSize = jpegSizes?.minByOrNull { it.width.toLong() * it.height } ?: Size(640, 480)

            val imageReader = android.media.ImageReader.newInstance(
                targetSize.width, targetSize.height, ImageFormat.JPEG, 1
            )

            imageReader.setOnImageAvailableListener({ reader ->
                val image = try { reader.acquireLatestImage() } catch (e: Exception) { null }
                try {
                    if (image != null) {
                        val buffer = image.planes[0].buffer
                        val bytes = ByteArray(buffer.remaining())
                        buffer.get(bytes)
                        deliver(saveToFile(context, bytes))
                    } else {
                        deliver(null)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to read captured image", e)
                    deliver(null)
                } finally {
                    image?.close()
                }
            }, backgroundHandler)

            cameraManager.openCamera(frontCameraId, object : CameraDevice.StateCallback() {
                override fun onOpened(device: CameraDevice) {
                    try {
                        val requestBuilder = device.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE)
                        requestBuilder.addTarget(imageReader.surface)

                        device.createCaptureSession(
                            listOf(imageReader.surface),
                            object : CameraCaptureSession.StateCallback() {
                                override fun onConfigured(session: CameraCaptureSession) {
                                    try {
                                        session.capture(
                                            requestBuilder.build(),
                                            object : CameraCaptureSession.CaptureCallback() {
                                                override fun onCaptureCompleted(
                                                    session: CameraCaptureSession,
                                                    request: CaptureRequest,
                                                    result: TotalCaptureResult
                                                ) {
                                                    backgroundHandler.postDelayed({
                                                        cleanup(device, session, imageReader)
                                                    }, 200)
                                                }

                                                override fun onCaptureFailed(
                                                    session: CameraCaptureSession,
                                                    request: CaptureRequest,
                                                    failure: CaptureFailure
                                                ) {
                                                    Log.e(TAG, "Capture failed: ${failure.reason}")
                                                    deliver(null)
                                                    cleanup(device, session, imageReader)
                                                }
                                            },
                                            backgroundHandler
                                        )
                                    } catch (e: Exception) {
                                        Log.e(TAG, "Error triggering capture", e)
                                        deliver(null)
                                        cleanup(device, session, imageReader)
                                    }
                                }

                                override fun onConfigureFailed(session: CameraCaptureSession) {
                                    Log.e(TAG, "Capture session configuration failed")
                                    deliver(null)
                                    cleanup(device, null, imageReader)
                                }
                            },
                            backgroundHandler
                        )
                    } catch (e: Exception) {
                        Log.e(TAG, "Camera access error while starting capture", e)
                        deliver(null)
                        cleanup(device, null, imageReader)
                    }
                }

                override fun onDisconnected(device: CameraDevice) {
                    deliver(null)
                    cleanup(device, null, imageReader)
                }

                override fun onError(device: CameraDevice, error: Int) {
                    Log.e(TAG, "Camera device error: $error")
                    deliver(null)
                    cleanup(device, null, imageReader)
                }
            }, backgroundHandler)
        } catch (e: Exception) {
            Log.e(TAG, "Unable to open front camera", e)
            deliver(null)
            backgroundThread.quitSafely()
        }
    }

    private fun findFrontCameraId(manager: CameraManager): String? {
        return try {
            manager.cameraIdList.firstOrNull { id ->
                manager.getCameraCharacteristics(id)
                    .get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_FRONT
            }
        } catch (e: Exception) {
            Log.e(TAG, "Unable to enumerate cameras", e)
            null
        }
    }

    private fun saveToFile(context: Context, bytes: ByteArray): File {
        val dir = File(context.filesDir, "alert_photos").apply { mkdirs() }
        val file = File(dir, "alert_${System.currentTimeMillis()}.jpg")
        FileOutputStream(file).use { it.write(bytes) }
        return file
    }
}
