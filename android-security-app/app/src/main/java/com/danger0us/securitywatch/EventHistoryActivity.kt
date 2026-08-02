package com.danger0us.securitywatch

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.io.File

class EventHistoryActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_history)

        val events = EventLogStore.loadEvents(this)

        findViewById<TextView>(R.id.emptyText).visibility =
            if (events.isEmpty()) android.view.View.VISIBLE else android.view.View.GONE

        val recyclerView = findViewById<RecyclerView>(R.id.historyList)
        recyclerView.layoutManager = LinearLayoutManager(this)
        recyclerView.adapter = AlertAdapter(events) { event -> openPhoto(event) }
    }

    private fun openPhoto(event: EventLogStore.AlertEvent) {
        val path = event.photoPath ?: return
        val file = File(path)
        if (!file.exists()) return

        val uri: Uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "image/jpeg")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        startActivity(Intent.createChooser(intent, getString(R.string.view_photo)))
    }
}
