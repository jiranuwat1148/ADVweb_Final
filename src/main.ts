import { bootstrapApplication } from "@angular/platform-browser";
import { Component } from "@angular/core";
import { provideRouter, RouterOutlet } from "@angular/router";
import { WorkspaceComponent } from "./app/workspace.component";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [RouterOutlet],
  template: "<router-outlet />",
})
class AppComponent {}

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter([
      { path: "", component: WorkspaceComponent, data: { view: "overview" } },
      {
        path: "orders",
        component: WorkspaceComponent,
        data: { view: "orders" },
      },
      {
        path: "customers",
        component: WorkspaceComponent,
        data: { view: "customers" },
      },
      { path: "rider", component: WorkspaceComponent, data: { view: "rider" } },
      { path: "**", redirectTo: "" },
    ]),
  ],
}).catch((error) => console.error(error));
