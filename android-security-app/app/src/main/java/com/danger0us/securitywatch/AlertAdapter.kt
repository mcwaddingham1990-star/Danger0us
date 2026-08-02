package com.danger0us.securitywatch

import android.graphics.BitmapFactory
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class AlertAdapter(
    private val events: List<EventLogStore.AlertEvent>,
    private val onClick: (EventLogStore.AlertEvent) -> Unit
) : RecyclerView.Adapter<AlertAdapter.ViewHolder>() {

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val thumbnail: ImageView = view.findViewById(R.id.thumbnail)
        val reason: TextView = view.findViewById(R.id.reasonText)
        val timestamp: TextView = view.findViewById(R.id.timestampText)
    }

    private val dateFormat = SimpleDateFormat("MMM d, yyyy h:mm:ss a", Locale.getDefault())

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_alert, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val event = events[position]
        holder.reason.text = event.reason
        holder.timestamp.text = dateFormat.format(Date(event.timestamp))
        if (event.photoPath != null) {
            holder.thumbnail.setImageBitmap(BitmapFactory.decodeFile(event.photoPath))
        } else {
            holder.thumbnail.setImageResource(android.R.drawable.ic_menu_report_image)
        }
        holder.itemView.setOnClickListener { onClick(event) }
    }

    override fun getItemCount(): Int = events.size
}
