# Copyright (c) 2025, Pragati Dike and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe.utils import get_datetime
from frappe.model.document import Document


class MaterialRequestforBiofoundry(Document):
	pass
	 
@frappe.whitelist()
def start_job(job_card_name, start_time, employee=None):
    """Start a Job Card: add a time log and set status to Work In Progress"""
    job_card = frappe.get_doc("Job Card", job_card_name)

    start_time = get_datetime(start_time)

    # Create a new child table row
    job_card.append("time_logs", {
        "from_time": start_time,
        "employee": employee
    })

    job_card.status = "Work In Progress"
    job_card.actual_start_date = start_time
    job_card.job_started = 1

    # Save safely
    job_card.save(ignore_version=True)
    frappe.db.commit()

    return {
        "status": job_card.status,
        "actual_start_date": job_card.actual_start_date
    }


@frappe.whitelist()
def complete_job_card(job_card, qty: float, end_time: str):
    """Mark a Job Card as Completed with given qty and end_time"""
    jc = frappe.get_doc("Job Card", job_card)

    end_time = get_datetime(end_time)
    qty = float(qty)

    if qty <= 0:
        frappe.throw("Completed Quantity must be greater than 0")

    # Find latest incomplete time log
    updated = False
    if jc.time_logs:
        for log in reversed(jc.time_logs):
            if not log.to_time:
                log.to_time = end_time
                log.completed_qty = qty
                if log.from_time:
                    log.time_in_mins = (end_time - log.from_time).total_seconds() / 60
                updated = True
                break

    # If no open log found, create a new one
    if not updated:
        jc.append("time_logs", {
            "from_time": end_time,
            "to_time": end_time,
            "completed_qty": qty,
            "time_in_mins": 0
        })

    # Update quantities
    total_completed = sum([t.completed_qty or 0 for t in jc.time_logs])
    jc.total_completed_qty = total_completed
    jc.actual_end_date = end_time

    # ✅ Force update status in DB
    frappe.db.set_value("Job Card", jc.name, {
        "status": "Completed",
        "actual_end_date": end_time,
        "total_completed_qty": total_completed
    })

    frappe.db.commit()

    return {
        "status": "Completed",
        "total_completed_qty": total_completed
    }

