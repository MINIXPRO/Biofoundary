frappe.ui.form.on("Biofoundry Job Card Detail", {
	job_card: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (!row.job_card) return;

		frappe.call({
			method: "frappe.client.get_value",
			args: {
				doctype: "Job Card",
				filters: { name: row.job_card },
				fieldname: ["operation", "workstation", "status"]
			},
			callback: function(r) {
				if (r.message) {
					frappe.model.set_value(cdt, cdn, "operation", r.message.operation);
					frappe.model.set_value(cdt, cdn, "workstation", r.message.workstation);
					frappe.model.set_value(cdt, cdn, "status", r.message.status);
				}
			}
		});
	},

	start_job: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (!row.job_card) {
			frappe.msgprint(__("Please select a Job Card first"));
			return;
		}

		frappe.prompt([
			{
				fieldtype: "Datetime",
				label: __("Start Time"),
				fieldname: "start_time",
				reqd: 1,
				default: frappe.datetime.now_datetime()
			},
			{
				fieldtype: "Link",
				options: "Employee",
				label: __("Operator"),
				fieldname: "employee"
			}
		], function(data) {
			frappe.call({
				method: "biofoundary.config.job_card.start_job",
				args: {
					job_card_name: row.job_card,
					start_time: data.start_time,
					employee: data.employee
				},
				callback: function(r) {
					if (r.message) {
						frappe.model.set_value(cdt, cdn, "start_time", data.start_time);
						frappe.model.set_value(cdt, cdn, "status", r.message.status);
						frappe.show_alert({ message: __("Job started successfully"), indicator: "green" });
						frm.refresh();
					}
				}
			});
		}, __("Start Job"), __("Start"));
	},

	complete_job: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (!row.job_card) {
			frappe.msgprint(__("Please select a Job Card first"));
			return;
		}

		frappe.prompt([
			{
				fieldtype: "Float",
				label: __("Completed Quantity"),
				fieldname: "qty",
				reqd: 1,
				default: 1
			},
			{
				fieldtype: "Datetime",
				label: __("End Time"),
				fieldname: "end_time",
				reqd: 1,
				default: frappe.datetime.now_datetime()
			}
		], function(data) {
			if (data.qty <= 0) {
				frappe.throw(__("Quantity should be greater than 0"));
				return;
			}

			frappe.call({
				method: "biofoundary.config.job_card.complete_job_card",
				args: {
					job_card: row.job_card,
					qty: data.qty,
					end_time: data.end_time
				},
				callback: function(r) {
					if (r.message) {
						frappe.model.set_value(cdt, cdn, "end_time", data.end_time);
						frappe.model.set_value(cdt, cdn, "completed_qty", data.qty);
						frappe.model.set_value(cdt, cdn, "status", r.message.status);
						frappe.show_alert({ message: __("Job completed successfully"), indicator: "green" });
						frm.refresh();
					}
				}
			});
		}, __("Complete Job"), __("Complete"));
	}
});
